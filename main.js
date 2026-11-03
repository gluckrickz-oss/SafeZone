'use strict';
// SafeZone (Linux/Windows): salas para assistir filme e série juntos.
const { app, BrowserWindow, ipcMain, desktopCapturer, session, nativeTheme, clipboard, shell, dialog } = require('electron');
const { spawn, execFile } = require('node:child_process');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const pulse = require('./lib/pulse');

if (!['linux', 'win32'].includes(process.platform)) { console.error('SafeZone: esta versão é para Linux e Windows 64 bits.'); process.exit(1); }

app.setName('SafeZone');
app.enableSandbox();

// Dois perfis no mesmo PC para testar: SAFEZONE_PROFILE=b safezone
const profile = process.env.SAFEZONE_PROFILE;
if (profile && /^[A-Za-z0-9_-]{1,32}$/.test(profile)) {
  app.setPath('userData', path.join(app.getPath('temp'), 'safezone-' + profile));
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
}

if (process.env.SAFEZONE_SOFTWARE === '1' || process.argv.includes('--software')) app.disableHardwareAcceleration();

const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
if (isWayland) app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
// Sem isso o Chromium segura o vídeo quando a janela fica minimizada ou atrás do player.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const APP_URL = pathToFileURL(path.join(__dirname, 'src', 'index.html')).toString();
const RELEASE_PAGE = 'https://github.com/gluckrickz-oss/SafeZone/releases/latest';
const isAppUrl = (u) => typeof u === 'string' && (u === APP_URL || u.startsWith(APP_URL + '#'));
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'display-capture']);

let win = null;
let pendingSourceId = null;
let audioProc = null;

// ---------- Navegador fechado: nada de abrir janela, navegar ou pedir permissão ----------

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

function hardenSession(ses) {
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const local = isAppUrl(wc.getURL());
    const microphoneOnly = permission === 'media' && details && Array.isArray(details.mediaTypes)
      && details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video');
    cb(local && (ALLOWED_PERMISSIONS.has(permission) || microphoneOnly));
  });
  ses.setPermissionCheckHandler((wc, permission, _origin, details) => {
    const local = !!wc && isAppUrl(wc.getURL());
    const microphoneOnly = permission === 'media' && details && details.mediaType === 'audio';
    return local && (ALLOWED_PERMISSIONS.has(permission) || microphoneOnly);
  });
  // A única rede que a janela usa é o servidor de apresentação do PeerJS.
  ses.webRequest.onBeforeRequest((details, cb) => {
    let u;
    try { u = new URL(details.url); } catch { return cb({ cancel: true }); }
    const local = ['file:', 'data:', 'blob:', 'devtools:'].includes(u.protocol);
    const peerjs = (u.protocol === 'https:' || u.protocol === 'wss:') && u.hostname === '0.peerjs.com';
    cb({ cancel: !(local || peerjs) });
  });
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (!isAppUrl(request.frame && request.frame.url)) return callback({});
      // No Wayland o próprio sistema pergunta o que compartilhar (portal); a primeira fonte devolvida é a escolhida.
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const source = isWayland ? sources[0] : sources.find((s) => s.id === pendingSourceId);
      pendingSourceId = null;
      const streams = source ? { video: source } : {};
      // O loopback do Electron captura o áudio de saída do sistema inteiro e só existe no Windows.
      if (source && process.platform === 'win32' && request.audioRequested) streams.audio = 'loopback';
      callback(streams);
    } catch { callback({}); }
  });
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    show: process.platform === 'win32', width: 1280, height: 760, minWidth: 900, minHeight: 560,
    title: 'SafeZone', backgroundColor: '#070a12', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, webviewTag: false, spellcheck: false,
      backgroundThrottling: false, devTools: !app.isPackaged,
    },
  });
  // Windows excludes this window from standard desktop capture APIs.
  if (process.platform === 'win32') win.setContentProtection(true);
  const showFallback = setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 8000);
  win.once('ready-to-show', () => { clearTimeout(showFallback); if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) dialog.showErrorBox('O SafeZone não conseguiu abrir', `${description} (${code})\n\n${url}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') dialog.showErrorBox('O SafeZone foi fechado inesperadamente', `Motivo: ${details.reason}\nCódigo: ${details.exitCode}`);
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if ((input.control && key === 'p') || ['printscreen', 'print', 'snapshot'].includes(key)) event.preventDefault();
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => { stopAudio(); win = null; });
}

// ---------- IPC: só a própria janela do SafeZone pode chamar, e tudo é validado ----------

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppUrl(event.senderFrame && event.senderFrame.url)) throw new Error('remetente não confiável');
    return fn(event, ...args);
  });
}

handle('platform', () => ({ wayland: isWayland, windows: process.platform === 'win32' }));

function latestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://api.github.com/repos/gluckrickz-oss/SafeZone/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SafeZone-Updater' },
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GitHub respondeu HTTP ' + res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy(new Error('Resposta do GitHub grande demais.'));
      });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (typeof data.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(data.tag_name)) throw new Error('Versão da release inválida.');
          resolve(data.tag_name.replace(/^v/, ''));
        } catch (err) { reject(err); }
      });
    });
    req.setTimeout(8000, () => req.destroy(new Error('Tempo esgotado ao consultar o GitHub.')));
    req.on('error', reject);
  });
}

async function readLimitedResponse(url, maxBytes) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Download do GitHub falhou (HTTP ${response.status}).`);
  let finalUrl;
  try { finalUrl = new URL(response.url); } catch { throw new Error('Endereço do download inválido.'); }
  if (finalUrl.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com'].includes(finalUrl.hostname)) throw new Error('O GitHub redirecionou para um endereço não autorizado.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('O arquivo de atualização excede o tamanho permitido.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

handle('install-update', async () => {
  if (process.platform !== 'win32') throw new Error('A instalação automática está disponível no Windows. No Linux, use o pacote da release.');
  const latest = await latestRelease();
  if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('A versão publicada no GitHub não é válida.');
  const current = app.getVersion().split('.').map(Number);
  const next = latest.split('.').map(Number);
  if (!next.some((part, i) => part !== current[i] && part > current[i] && next.slice(0, i).every((n, j) => n === current[j]))) {
    throw new Error('Não há uma versão mais nova para instalar. Verifique novamente as atualizações.');
  }

  const base = `https://github.com/gluckrickz-oss/SafeZone/releases/download/v${latest}/safezone-${latest}-windows-x64-setup.exe`;
  const [installerBytes, checksumBytes] = await Promise.all([readLimitedResponse(base, 300 * 1024 * 1024), readLimitedResponse(base + '.sha256', 4096)]);
  const expected = checksumBytes.toString('utf8').trim().match(/^([a-f0-9]{64})\s/m);
  const actual = crypto.createHash('sha256').update(installerBytes).digest('hex');
  if (!expected || expected[1] !== actual) throw new Error('A verificação SHA-256 do instalador falhou. Nenhuma alteração foi feita.');

  const installerPath = path.join(app.getPath('temp'), `safezone-${latest}-windows-x64-setup.exe`);
  fs.writeFileSync(installerPath, installerBytes, { mode: 0o700 });
  const child = spawn(installerPath, [], { detached: true, stdio: 'ignore', windowsHide: false });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  setTimeout(() => app.quit(), 500);
  return { started: true, version: latest };
});

handle('check-updates', async () => {
  const current = app.getVersion();
  const latest = await latestRelease();
  const numeric = (v) => v.split('.').map(Number);
  const a = numeric(current), b = numeric(latest);
  let available = false;
  for (let i = 0; i < 3; i++) { if (b[i] !== a[i]) { available = b[i] > a[i]; break; } }
  return { current, latest, available };
});
handle('open-release-page', async () => { await shell.openExternal(RELEASE_PAGE); return true; });

handle('get-sources', async () => {
  if (isWayland) return [];
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
  return sources
    .filter((s) => s.name !== 'SafeZone')
    .map((s) => ({ id: s.id, name: pulse.clean(s.name, 120), screen: s.id.startsWith('screen:'), thumb: s.thumbnail.toDataURL() }));
});

handle('select-source', (_e, id) => {
  if (typeof id !== 'string' || !/^(screen|window):\d+:\d+$/.test(id)) throw new Error('fonte inválida');
  pendingSourceId = id;
});

const pactl = (args) => new Promise((resolve, reject) => {
  execFile('pactl', args, { env: { ...process.env, LC_ALL: 'C' }, timeout: 4000, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

handle('list-apps', async () => {
  if (process.platform !== 'linux') return [];
  try { return pulse.listApps(await pactl(['list', 'sink-inputs']), pulse.makeIsOwn(process.pid)); } catch { return []; }
});

handle('audio-driver', async () => {
  if (process.platform === 'win32') return 'Áudio do Windows (microfone e saída padrão do sistema)';
  try {
    const info = await pactl(['info']);
    if (/pipewire/i.test(info)) return 'PipeWire (compatibilidade PulseAudio)';
    if (/pulseaudio/i.test(info)) return 'PulseAudio';
  } catch {}
  return 'Driver de áudio padrão do Linux';
});

handle('start-audio', async (event, id) => {
  if (process.platform !== 'linux') return { ok: false, error: 'Captura de áudio por programa está disponível apenas no Linux.' };
  if (typeof id !== 'string' || !/^\d{1,9}$/.test(id)) return { ok: false, error: 'programa inválido' };
  stopAudio();
  let target;
  try { target = pulse.monitorTarget(await pactl(['list', 'sink-inputs']), await pactl(['list', 'sinks']), id); } catch {
    return { ok: false, error: 'Não consegui falar com o PulseAudio/PipeWire (instale pulseaudio-utils ou pipewire-pulse).' };
  }
  if (!target) return { ok: false, error: 'Esse programa parou de tocar som. Dê play nele e tente de novo.' };

  return new Promise((resolve) => {
    const proc = spawn('parec', [
      '--raw', '--format=s16le', '--rate=48000', '--channels=2', '--latency-msec=20',
      '--device=' + target.source, '--monitor-stream=' + target.sinkInput,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    audioProc = proc;
    let errText = '';
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    proc.stdout.on('data', (chunk) => { if (proc === audioProc && !event.sender.isDestroyed()) event.sender.send('audio-pcm', chunk); });
    proc.stderr.on('data', (d) => { if (errText.length < 2000) errText += d.toString(); });
    proc.on('exit', (code) => {
      if (proc === audioProc) audioProc = null;
      if (code) done({ ok: false, error: errText.trim() || 'O capturador de som fechou.' });
      if (!event.sender.isDestroyed()) event.sender.send('audio-ended');
    });
    proc.on('error', (err) => done({ ok: false, error: err.code === 'ENOENT' ? 'parec não encontrado (instale pulseaudio-utils ou pipewire-pulse).' : err.message }));
    setTimeout(() => done({ ok: true }), 1200);
  });
});

handle('stop-audio', () => { stopAudio(); });

handle('copy', (_e, text) => {
  if (typeof text !== 'string' || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{13}$/.test(text)) throw new Error('texto inválido');
  clipboard.writeText(text);
});

// Servidor de apoio (TURN) é opcional e NUNCA vai dentro do programa: as credenciais ficam só no seu PC,
// em ~/.config/SafeZone/turn.json (permissão 600): { "keyId": "...", "apiToken": "..." }
let turnCache = null;
function loadTurnConfig() {
  const file = path.join(app.getPath('userData'), 'turn.json');
  try {
    // O perfil do Windows já usa ACLs próprias; bits POSIX não representam suas permissões.
    if (process.platform === 'linux' && (fs.statSync(file).mode & 0o077)) { console.warn('turn.json ignorado: rode chmod 600 nele.'); return null; }
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c.keyId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(c.keyId) && typeof c.apiToken === 'string' && c.apiToken.length <= 256) return c;
  } catch {}
  return null;
}

handle('ice-servers', async () => {
  if (turnCache && turnCache.until > Date.now()) return turnCache.servers;
  const cfg = loadTurnConfig();
  if (!cfg) return [];
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfg.keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    const servers = list
      .map((s) => ({ username: s && s.username, credential: s && s.credential, urls: [].concat((s && s.urls) || []).filter((u) => typeof u === 'string' && /^(turns?|stuns?):/.test(u) && !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length && typeof s.username === 'string' && typeof s.credential === 'string');
    turnCache = { servers, until: Date.now() + 12 * 3600 * 1000 };
    return servers;
  } catch (err) {
    console.warn('turn', err.message);
    return [];
  }
});

function stopAudio() {
  if (!audioProc) return;
  const proc = audioProc;
  audioProc = null;
  try { proc.kill('SIGTERM'); } catch {}
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { hardenSession(session.defaultSession); createWindow(); })
  .catch((err) => dialog.showErrorBox('O SafeZone não conseguiu iniciar', err && err.stack ? err.stack : String(err)));
app.on('before-quit', stopAudio);
app.on('window-all-closed', () => { stopAudio(); app.quit(); });
