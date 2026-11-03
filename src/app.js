'use strict';
// SafeZone: a sala vive no PC de quem criou (o dono). Todo mundo se conecta a ele para saber quem está na sala
// e quem está transmitindo; o vídeo vai direto de quem transmite para quem escolheu assistir.
// Tudo que chega pela rede é tratado como não confiável: formato, tamanho e frequência são conferidos.
const ROOM_PREFIX = 'safezone-sala-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos: 13 caracteres = 65 bits
const CODE_LEN = 13;
const MAX_MEMBERS = 12;
const TEXT_CHANNELS = new Set(['geral', 'filmes']);
const VOICE_CHANNEL = 'voz-geral';
const QUALITIES = {
  '720': { width: 1280, height: 720, bitrate: 5_000_000 },
  '1080': { width: 1920, height: 1080, bitrate: 10_000_000 },
};
let quality = QUALITIES['720'];
const AUDIO_BITRATE = 256_000;
const CONNECT_TIMEOUT = 20000;
const STALE_MS = 15000;
const BASE_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

async function peerOptions() {
  let ice = BASE_ICE;
  try {
    const turn = await window.safezone.iceServers();
    if (Array.isArray(turn) && turn.length) ice = [...BASE_ICE, ...turn];
  } catch {}
  return { debug: 0, config: { iceServers: ice } };
}

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['home', 'room', 'nameInput', 'codeInput', 'createBtn', 'joinBtn', 'homeError', 'roomCode', 'peopleCount',
  'shareBtn', 'shareStatus', 'shareIdle', 'leaveBtn', 'memberList', 'memberCountBadge', 'watchTitle', 'stats', 'stage', 'video', 'stageMsg', 'stageEmpty', 'controls',
  'muteBtn', 'volume', 'fullBtn', 'shareModal', 'sourceGrid', 'appSelect', 'qualitySelect', 'cancelShare', 'confirmShare', 'toast',
  'tabs', 'waylandNote', 'audioLabel', 'audioHint', 'myNickname', 'chatPanel', 'chatMessages', 'chatForm', 'chatInput',
  'voiceChannelBtn', 'voiceChannelCount', 'voicePanel', 'voicePanelHint', 'voiceRoster', 'voiceToggleBtn', 'micBtn',
  'audioSettingsBtn', 'audioSettingsRoomBtn', 'audioSettingsModal', 'audioSettingsForm', 'audioDriverLabel', 'microphoneSelect', 'speakerSelect', 'audioSettingsHint', 'loadAudioDevices', 'cancelAudioSettings', 'voiceModeSelect', 'pushToTalkKey', 'echoCancellation', 'noiseSuppression', 'autoGainControl',
  'checkUpdatesBtn', 'updateStatus', 'updateModal', 'updateModalText', 'openReleaseBtn', 'closeUpdateModal'].map((id) => [id, $(id)]));

const isId = (s) => typeof s === 'string' && /^[\w-]{1,64}$/.test(s);
const cleanName = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Alguém';
const safeTime = (value) => { const n = Number(value); return Number.isFinite(n) && Math.abs(n) <= 8.64e15 ? n : Date.now(); };
const isMsg = (m) => m && typeof m === 'object' && typeof m.t === 'string';
// No máximo 40 mensagens por segundo por conexão; passou disso, a conexão é derrubada.
function rateGuard() {
  let n = 0; let t = Date.now();
  return () => { const now = Date.now(); if (now - t > 1000) { t = now; n = 0; } return ++n <= 40; };
}

let peer = null, myId = null, myName = '', roomCode = '', isOwner = false, ownerConn = null, inRoom = false;
let lastOwnerMsg = 0, heartbeat = null, connectTimer = null, wayland = false, isWindows = false;
const members = new Map(); // só o dono: id -> { conn, name, streaming, lastSeen }
let memberList = [];       // todos: [{ id, name, streaming, owner }]
let activeChannel = 'watch', voiceRoster = [], voiceStream = null, voiceChannel = null, micMuted = false;
let selectedMicrophone = '', selectedSpeaker = '', latestUpdateAvailable = false;
let voiceMode = 'open', pushToTalkCode = 'KeyV';
let audioProcessing = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
try { selectedMicrophone = localStorage.getItem('safezone-microphone') || ''; selectedSpeaker = localStorage.getItem('safezone-speaker') || ''; } catch {}
try {
  const savedVoice = JSON.parse(localStorage.getItem('safezone-voice-settings') || '{}');
  if (savedVoice.mode === 'open' || savedVoice.mode === 'ptt') voiceMode = savedVoice.mode;
  if (typeof savedVoice.pushToTalkCode === 'string' && /^[A-Z][A-Za-z0-9]+$|^(Space|Backquote|BracketLeft|BracketRight|Comma|Period|Slash|Semicolon|Quote|Minus|Equal)$/.test(savedVoice.pushToTalkCode)) pushToTalkCode = savedVoice.pushToTalkCode;
  for (const key of Object.keys(audioProcessing)) if (typeof savedVoice[key] === 'boolean') audioProcessing[key] = savedVoice[key];
} catch {}
const chatHistory = new Map([...TEXT_CHANNELS].map((channel) => [channel, []]));
const voiceCalls = new Map(), voiceAudio = new Map();
let localStream = null, audioPipe = null;
const outgoing = new Map();
let watching = null, watchAskedAt = 0, incoming = null, statsTimer = null;

const platformReady = window.safezone.platform().then((p) => {
  wayland = !!(p && p.wayland);
  isWindows = !!(p && p.windows);
}).catch(() => {});

function startConnectTimer(text) {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (inRoom) return;
    if (peer) { peer.destroy(); peer = null; }
    setHomeBusy(false);
    showHomeError(text);
  }, CONNECT_TIMEOUT);
}

// ---------- Tela inicial ----------

try { ui.nameInput.value = localStorage.getItem('safezone-name') || ''; } catch {}
try { if (QUALITIES[localStorage.getItem('safezone-quality')]) ui.qualitySelect.value = localStorage.getItem('safezone-quality'); } catch {}

function readName() {
  const name = ui.nameInput.value.trim();
  if (!name) { showHomeError('Escolha um apelido antes de entrar.'); ui.nameInput.focus(); return null; }
  try { localStorage.setItem('safezone-name', name); } catch {}
  return name;
}

function saveVoiceSettings() {
  try { localStorage.setItem('safezone-voice-settings', JSON.stringify({ mode: voiceMode, pushToTalkCode, ...audioProcessing })); } catch {}
}

function formatHotkey(code) {
  if (code === 'Space') return 'Espaço';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

function setPushToTalk(pressed) {
  if (voiceMode !== 'ptt' || !voiceStream || voiceChannel !== VOICE_CHANNEL) return;
  micMuted = !pressed;
  for (const track of voiceStream.getAudioTracks()) track.enabled = pressed;
  renderVoiceChannel();
}

document.addEventListener('keydown', (event) => {
  if (ui.pushToTalkKey.dataset.listening === 'true') {
    event.preventDefault();
    if (event.code === 'Escape') { ui.pushToTalkKey.dataset.listening = ''; ui.pushToTalkKey.textContent = formatHotkey(pushToTalkCode); return; }
    if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && (/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space)$/.test(event.code))) {
      pushToTalkCode = event.code;
      ui.pushToTalkKey.dataset.listening = '';
      ui.pushToTalkKey.textContent = formatHotkey(pushToTalkCode);
      saveVoiceSettings();
    }
    return;
  }
  if (event.code !== pushToTalkCode || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  if (voiceMode === 'ptt') { event.preventDefault(); setPushToTalk(true); }
});
document.addEventListener('keyup', (event) => { if (event.code === pushToTalkCode) setPushToTalk(false); });
window.addEventListener('blur', () => setPushToTalk(false));

async function refreshAudioDevices(requestPermission) {
  try {
    if (requestPermission) {
      const temporary = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      temporary.getTracks().forEach((track) => track.stop());
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    const outputs = devices.filter((device) => device.kind === 'audiooutput');
    ui.microphoneSelect.replaceChildren(new Option('Microfone padrão do sistema', ''));
    inputs.forEach((device, i) => ui.microphoneSelect.add(new Option(device.label || `Microfone ${i + 1}`, device.deviceId)));
    ui.speakerSelect.replaceChildren(new Option('Saída padrão do sistema', ''));
    outputs.forEach((device, i) => ui.speakerSelect.add(new Option(device.label || `Saída de áudio ${i + 1}`, device.deviceId)));
    ui.microphoneSelect.value = inputs.some((device) => device.deviceId === selectedMicrophone) ? selectedMicrophone : '';
    ui.speakerSelect.value = outputs.some((device) => device.deviceId === selectedSpeaker) ? selectedSpeaker : '';
    const supportsOutput = typeof HTMLMediaElement.prototype.setSinkId === 'function';
    ui.speakerSelect.disabled = !supportsOutput;
    ui.audioSettingsHint.textContent = inputs.length
      ? (supportsOutput ? 'Escolha os dispositivos que quer usar. O microfone só é ativado ao entrar no canal de voz.' : 'Microfone detectado. A seleção de saída de áudio não é compatível com esta versão do sistema.')
      : 'Nenhum microfone foi encontrado. Confira as permissões e os dispositivos do sistema.';
  } catch (err) {
    ui.audioSettingsHint.textContent = err && err.name === 'NotAllowedError'
      ? 'A permissão do microfone foi negada. Ative-a nas permissões do SafeZone no sistema.'
      : 'Não consegui listar os dispositivos de áudio. Confira as permissões do sistema.';
  }
}

async function openAudioSettings() {
  ui.audioSettingsModal.hidden = false;
  ui.voiceModeSelect.value = voiceMode;
  ui.pushToTalkKey.textContent = formatHotkey(pushToTalkCode);
  ui.echoCancellation.checked = audioProcessing.echoCancellation;
  ui.noiseSuppression.checked = audioProcessing.noiseSuppression;
  ui.autoGainControl.checked = audioProcessing.autoGainControl;
  ui.audioDriverLabel.textContent = 'Driver: detectando…';
  window.safezone.audioDriver().then((label) => { ui.audioDriverLabel.textContent = 'Driver detectado: ' + label; })
    .catch(() => { ui.audioDriverLabel.textContent = 'Driver de áudio padrão do sistema'; });
  await refreshAudioDevices(false);
}

async function applySpeaker(deviceId) {
  const elements = [...document.querySelectorAll('audio[data-peer]')];
  await Promise.all(elements.map((audio) => typeof audio.setSinkId === 'function' ? audio.setSinkId(deviceId) : Promise.resolve()));
}

async function saveAudioSettings(event) {
  event.preventDefault();
  const wasInVoice = voiceChannel === VOICE_CHANNEL;
  if (wasInVoice) leaveVoice();
  selectedMicrophone = ui.microphoneSelect.value;
  selectedSpeaker = ui.speakerSelect.value;
  voiceMode = ui.voiceModeSelect.value === 'ptt' ? 'ptt' : 'open';
  audioProcessing = {
    echoCancellation: ui.echoCancellation.checked,
    noiseSuppression: ui.noiseSuppression.checked,
    autoGainControl: ui.autoGainControl.checked,
  };
  try { localStorage.setItem('safezone-microphone', selectedMicrophone); localStorage.setItem('safezone-speaker', selectedSpeaker); } catch {}
  saveVoiceSettings();
  try {
    await applySpeaker(selectedSpeaker);
    ui.audioSettingsModal.hidden = true;
    if (wasInVoice) await enterVoice();
  } catch {
    ui.audioSettingsHint.textContent = 'Não foi possível usar essa saída. Escolha a saída padrão e tente novamente.';
    if (wasInVoice) await enterVoice();
  }
}

async function checkForUpdates() {
  await platformReady;
  ui.checkUpdatesBtn.disabled = true;
  ui.updateStatus.textContent = 'Consultando o GitHub…';
  ui.updateModalText.textContent = 'Consultando a versão publicada no GitHub…';
  ui.openReleaseBtn.hidden = true;
  ui.updateModal.hidden = false;
  try {
    const result = await window.safezone.checkUpdates();
    latestUpdateAvailable = result.available;
    const installSteps = isWindows
      ? 'Baixe o instalador Windows e execute-o para atualizar.'
      : 'Baixe o pacote Linux, extraia-o e execute ./install.sh para atualizar.';
    ui.updateModalText.textContent = result.available
      ? `A versão ${result.latest} está disponível. Sua versão é ${result.current}. Abra a página oficial. ${installSteps} Feche o SafeZone antes de atualizar.`
      : `Você está usando a versão mais recente (${result.current}).`;
    ui.updateStatus.textContent = result.available ? `Versão ${result.latest} disponível` : `Atualizado · ${result.current}`;
    ui.checkUpdatesBtn.textContent = result.available ? 'Baixar atualização' : 'Verificar atualizações no GitHub';
    ui.openReleaseBtn.hidden = !result.available;
  } catch {
    latestUpdateAvailable = false;
    ui.updateModalText.textContent = 'Não consegui consultar o GitHub agora. Confira sua conexão ou abra a página de versões depois.';
    ui.updateStatus.textContent = 'Não foi possível verificar agora';
    ui.checkUpdatesBtn.textContent = 'Verificar atualizações no GitHub';
    ui.openReleaseBtn.hidden = false;
  } finally { ui.checkUpdatesBtn.disabled = false; }
}

ui.audioSettingsBtn.onclick = openAudioSettings;
ui.audioSettingsRoomBtn.onclick = openAudioSettings;
ui.loadAudioDevices.onclick = () => refreshAudioDevices(true);
ui.cancelAudioSettings.onclick = () => { ui.audioSettingsModal.hidden = true; };
ui.audioSettingsForm.onsubmit = saveAudioSettings;
ui.pushToTalkKey.onclick = () => {
  ui.pushToTalkKey.textContent = 'Pressione uma tecla…';
  ui.pushToTalkKey.dataset.listening = 'true';
};
ui.checkUpdatesBtn.onclick = () => latestUpdateAvailable
  ? window.safezone.openReleasePage().catch(() => toast('Não consegui abrir o GitHub.'))
  : checkForUpdates();
ui.closeUpdateModal.onclick = () => { ui.updateModal.hidden = true; };
ui.openReleaseBtn.onclick = () => window.safezone.openReleasePage().catch(() => toast('Não consegui abrir o GitHub.'));
function showHomeError(text) { ui.homeError.textContent = text; ui.homeError.hidden = !text; }
function setHomeBusy(busy) { ui.createBtn.disabled = busy; ui.joinBtn.disabled = busy; }

ui.createBtn.onclick = () => {
  const name = readName();
  if (!name) return;
  myName = name; showHomeError(''); setHomeBusy(true); createRoom();
};
ui.joinBtn.onclick = () => {
  const name = readName();
  if (!name) return;
  const code = ui.codeInput.value.trim().toUpperCase();
  if (!new RegExp('^[' + CODE_CHARS + ']{' + CODE_LEN + '}$').test(code)) return showHomeError('O convite tem ' + CODE_LEN + ' letras e números. Atualize o SafeZone de quem criou a sala para usar convites novos.');
  myName = name; showHomeError(''); setHomeBusy(true); joinRoom(code);
};
ui.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.joinBtn.click(); });
ui.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (ui.codeInput.value.trim()) ui.joinBtn.click(); else ui.codeInput.focus(); } });

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN)); // 256 é múltiplo de 32: sem viés
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// ---------- Criar e entrar ----------

async function createRoom() {
  const code = randomCode();
  const options = await peerOptions();
  startConnectTimer('Não consegui falar com o servidor das salas. Confere sua internet e tenta de novo.');
  peer = new Peer(ROOM_PREFIX + code, options);
  peer.on('open', (id) => {
    myId = id; isOwner = true; roomCode = code;
    members.set(myId, { conn: null, name: myName, streaming: false, voiceChannel: null, lastSeen: Date.now() });
    enterRoom();
    broadcastMembers();
  });
  peer.on('connection', (conn) => {
    const allowed = rateGuard();
    // Quem conecta e não se apresenta em 10 s é dispensado.
    const timer = setTimeout(() => { if (!members.has(conn.peer)) conn.close(); }, 10000);
    conn.on('data', (msg) => { if (!allowed()) conn.close(); else ownerHandle(conn.peer, msg, conn); });
    const gone = () => { clearTimeout(timer); removeMember(conn.peer, conn); };
    conn.on('close', gone);
    conn.on('error', gone);
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && !inRoom) { peer.destroy(); return createRoom(); }
    handlePeerError(err);
  });
  setupMedia(peer);
}

async function joinRoom(code) {
  const options = await peerOptions();
  startConnectTimer('Não consegui falar com o servidor das salas. Confere sua internet e tenta de novo.');
  peer = new Peer(options);
  peer.on('open', (id) => {
    myId = id;
    startConnectTimer('Achei a sala, mas não consegui conectar no PC de quem criou. A internet de um de vocês está bloqueando a conexão direta.');
    const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
    conn.on('open', () => {
      ownerConn = conn; roomCode = code; isOwner = false; lastOwnerMsg = Date.now();
      conn.send({ t: 'hello', name: myName });
      enterRoom();
    });
    conn.on('data', (msg) => { lastOwnerMsg = Date.now(); memberHandle(msg); });
    conn.on('close', () => roomClosed('A sala foi fechada por quem criou.'));
  });
  // Só o dono da sala abre conexões de dados; qualquer outra tentativa é recusada.
  peer.on('connection', (c) => c.close());
  peer.on('error', handlePeerError);
  setupMedia(peer);
}

function handlePeerError(err) {
  console.warn('peer', err.type);
  if (!inRoom) {
    clearTimeout(connectTimer);
    setHomeBusy(false);
    if (err.type === 'peer-unavailable') showHomeError('Não achei essa sala. Confere o código.');
    else if (['network', 'server-error', 'socket-error'].includes(err.type)) showHomeError('Sem conexão com o servidor. Confere sua internet e tenta de novo.');
    else showHomeError('Não deu para conectar (' + err.type + ').');
    if (peer) { peer.destroy(); peer = null; }
    return;
  }
  if (['network', 'server-error', 'socket-error'].includes(err.type) && peer && peer.disconnected && !peer.destroyed) peer.reconnect();
}

function enterRoom() {
  clearTimeout(connectTimer);
  inRoom = true;
  setHomeBusy(false);
  ui.home.hidden = true;
  ui.room.hidden = false;
  ui.myNickname.textContent = myName;
  ui.roomCode.textContent = roomCode;
  selectChannel('watch');
  renderMembers();
  showStage();
  clearInterval(heartbeat);
  heartbeat = setInterval(tick, 4000);
}

function tick() {
  if (isOwner) {
    const now = Date.now();
    let voiceChanged = false;
    for (const [id, m] of members) {
      if (id !== myId && now - m.lastSeen > STALE_MS) {
        if (m.voiceChannel === VOICE_CHANNEL) voiceChanged = true;
        try { m.conn.close(); } catch {}
        members.delete(id);
      }
    }
    if (voiceChanged) updateVoiceRoster();
    broadcastMembers();
  } else if (ownerConn) {
    try { ownerConn.send({ t: 'ping' }); } catch {}
    if (Date.now() - lastOwnerMsg > STALE_MS) roomClosed('Perdi a conexão com a sala.');
  }
  if (watching && watching !== myId && !incoming && Date.now() - watchAskedAt > 8000) {
    const target = memberList.find((m) => m.id === watching);
    if (target && target.streaming) askToWatch(watching);
  }
}

function leaveRoom() {
  if (isOwner) for (const [id, m] of members) if (id !== myId) { try { m.conn.send({ t: 'closed' }); } catch {} }
  setTimeout(resetAll, isOwner ? 300 : 0);
}
function roomClosed(text) { if (!inRoom) return; toast(text); resetAll(); }

function resetAll() {
  leaveVoice();
  inRoom = false;
  clearInterval(heartbeat);
  stopShare(true);
  stopWatching();
  members.clear(); memberList = []; ownerConn = null; isOwner = false;
  if (peer) { peer.destroy(); peer = null; }
  ui.room.hidden = true;
  ui.home.hidden = false;
  selectChannel('watch');
  setHomeBusy(false);
}

ui.leaveBtn.onclick = leaveRoom;
ui.roomCode.onclick = () => { window.safezone.copy(roomCode).then(() => toast('Código copiado! Manda pro pessoal.')).catch(() => {}); };

// ---------- Mensagens ----------

function sendToOwner(msg) {
  if (isOwner) ownerHandle(myId, msg, null);
  else if (ownerConn) { try { ownerConn.send(msg); } catch {} }
}
function deliver(id, msg) {
  if (id === myId) return memberHandle(msg);
  const m = members.get(id);
  if (m && m.conn) { try { m.conn.send(msg); } catch {} }
}

// Só o dono roda isto. `from` vem do PeerJS (não do conteúdo da mensagem), então ninguém se passa por outro.
function ownerHandle(from, msg, conn) {
  if (!isMsg(msg)) return;
  const m = members.get(from);
  if (m) m.lastSeen = Date.now();
  switch (msg.t) {
    case 'hello':
      if (m || !conn) return;
      if (members.size >= MAX_MEMBERS) { try { conn.send({ t: 'full' }); } catch {} setTimeout(() => conn.close(), 300); return; }
      members.set(from, { conn, name: cleanName(msg.name), streaming: false, voiceChannel: null, lastSeen: Date.now() });
      broadcastMembers();
      deliver(from, { t: 'chat-history', channels: Object.fromEntries(chatHistory) });
      break;
    case 'streaming':
      if (m) { m.streaming = msg.on === true; broadcastMembers(); }
      break;
    case 'chat-send': {
      if (!m || !TEXT_CHANNELS.has(msg.channel) || typeof msg.text !== 'string') return;
      const text = msg.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500);
      if (!text) return;
      const item = { name: m.name, text, at: Date.now() };
      const history = chatHistory.get(msg.channel);
      history.push(item);
      if (history.length > 100) history.shift();
      for (const id of members.keys()) deliver(id, { t: 'chat-message', channel: msg.channel, message: item });
      break;
    }
    case 'voice-join':
      if (!m || msg.channel !== VOICE_CHANNEL) return;
      m.voiceChannel = VOICE_CHANNEL;
      updateVoiceRoster();
      broadcastMembers();
      break;
    case 'voice-leave':
      if (!m || m.voiceChannel !== VOICE_CHANNEL) return;
      m.voiceChannel = null;
      updateVoiceRoster();
      broadcastMembers();
      break;
    case 'watch':
    case 'unwatch': {
      if (!m || !isId(msg.target) || msg.target === from) return;
      const target = members.get(msg.target);
      if (!target || (msg.t === 'watch' && !target.streaming)) return;
      deliver(msg.target, { t: msg.t === 'watch' ? 'watch-req' : 'unwatch-req', from });
      break;
    }
  }
}

function removeMember(id, conn) {
  const m = members.get(id);
  if (!m || (conn && m.conn !== conn)) return;
  const wasInVoice = m.voiceChannel === VOICE_CHANNEL;
  members.delete(id);
  if (wasInVoice) updateVoiceRoster();
  broadcastMembers();
}

function broadcastMembers() {
  const list = [...members].map(([id, m]) => ({ id, name: m.name, streaming: m.streaming, voiceChannel: m.voiceChannel, owner: id === myId }));
  for (const id of members.keys()) deliver(id, { t: 'members', list });
}

function updateVoiceRoster() {
  const users = [...members].filter(([, m]) => m.voiceChannel === VOICE_CHANNEL).map(([id, m]) => ({ id, name: m.name }));
  for (const [id, m] of members) if (m.voiceChannel === VOICE_CHANNEL) deliver(id, { t: 'voice-roster', channel: VOICE_CHANNEL, users });
}

// Só o dono manda mensagens para os outros (a conexão é a dele).
function memberHandle(msg) {
  if (!isMsg(msg)) return;
  switch (msg.t) {
    case 'members':
      memberList = (Array.isArray(msg.list) ? msg.list : []).slice(0, MAX_MEMBERS)
        .filter((m) => m && isId(m.id))
        .map((m) => ({ id: m.id, name: cleanName(m.name), streaming: m.streaming === true, voiceChannel: m.voiceChannel === VOICE_CHANNEL ? VOICE_CHANNEL : null, owner: m.owner === true }));
      for (const id of outgoing.keys()) if (!memberList.some((m) => m.id === id)) closeOutgoing(id);
      if (watching) {
        const target = memberList.find((m) => m.id === watching);
        if (!target) stopWatching();
        else if (!target.streaming && incoming) closeIncoming();
      }
      renderMembers();
      renderVoiceChannel();
      showStage();
      break;
    case 'chat-history':
      for (const channel of TEXT_CHANNELS) {
        const list = msg.channels && Array.isArray(msg.channels[channel]) ? msg.channels[channel].slice(-100) : [];
        chatHistory.set(channel, list.filter((item) => item && typeof item.name === 'string' && typeof item.text === 'string').map((item) => ({ name: cleanName(item.name), text: item.text.slice(0, 500), at: safeTime(item.at) })));
      }
      renderChat();
      break;
    case 'chat-message':
      if (!TEXT_CHANNELS.has(msg.channel) || !msg.message || typeof msg.message.text !== 'string' || typeof msg.message.name !== 'string') return;
      {
        const list = chatHistory.get(msg.channel);
        list.push({ name: cleanName(msg.message.name), text: msg.message.text.slice(0, 500), at: safeTime(msg.message.at) });
        if (list.length > 100) list.shift();
        if (activeChannel === msg.channel) renderChat();
      }
      break;
    case 'voice-roster':
      if (msg.channel !== VOICE_CHANNEL || !Array.isArray(msg.users)) return;
      voiceRoster = msg.users.slice(0, MAX_MEMBERS).filter((u) => u && isId(u.id)).map((u) => ({ id: u.id, name: cleanName(u.name) }));
      syncVoiceCalls();
      renderVoiceChannel();
      break;
    case 'watch-req':
      if (localStream && isId(msg.from) && memberList.some((m) => m.id === msg.from)) callViewer(msg.from);
      break;
    case 'unwatch-req':
      if (isId(msg.from)) closeOutgoing(msg.from);
      break;
    case 'closed': roomClosed('A sala foi fechada por quem criou.'); break;
    case 'full': roomClosed('A sala está cheia.'); break;
  }
}

// ---------- Lista de pessoas ----------

function renderMembers() {
  ui.peopleCount.textContent = memberList.length === 1 ? '1 pessoa na sala' : memberList.length + ' pessoas na sala';
  ui.memberCountBadge.textContent = String(memberList.length);
  ui.memberList.replaceChildren(...memberList.map((m) => {
    const li = document.createElement('li');
    li.className = 'member' + (m.streaming ? ' live' : '') + (m.id === watching ? ' selected' : '');
    const top = document.createElement('div');
    top.className = 'member-top';
    const name = document.createElement('span');
    name.className = 'member-name';
    name.textContent = m.name;
    top.append(name);
    if (m.owner) top.append(badge('DONO'));
    if (m.id === myId) top.append(badge('VOCÊ'));
    const state = document.createElement('div');
    state.className = 'member-state';
    state.textContent = m.streaming ? '● Transmitindo' : m.voiceChannel ? '● No canal de voz' : 'Na sala';
    li.append(top, state);
    if (m.streaming) li.onclick = () => selectMember(m.id);
    return li;
  }));
}
function badge(text) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = text; return b; }

function selectChannel(channel) {
  activeChannel = channel;
  document.querySelectorAll('.channel-select').forEach((button) => button.classList.toggle('active', button.dataset.channel === channel));
  ui.voiceChannelBtn.classList.toggle('active', channel === VOICE_CHANNEL);
  const heading = document.querySelector('.room-heading strong');
  if (channel === 'watch') {
    heading.textContent = 'sala';
    ui.video.closest('.viewer').hidden = false;
    ui.chatPanel.hidden = true;
    ui.voicePanel.hidden = true;
  } else if (TEXT_CHANNELS.has(channel)) {
    heading.textContent = channel;
    ui.video.closest('.viewer').hidden = true;
    ui.chatPanel.hidden = false;
    ui.voicePanel.hidden = true;
    ui.chatInput.placeholder = 'Mensagem em #' + channel;
    renderChat();
  } else {
    heading.textContent = VOICE_CHANNEL;
    ui.video.closest('.viewer').hidden = true;
    ui.chatPanel.hidden = true;
    ui.voicePanel.hidden = false;
    renderVoiceChannel();
  }
}

function renderChat() {
  if (!ui.chatMessages) return;
  const list = chatHistory.get(activeChannel) || [];
  ui.chatMessages.replaceChildren(...list.map((item) => {
    const row = document.createElement('article'); row.className = 'chat-message';
    const avatar = document.createElement('span'); avatar.className = 'chat-avatar'; avatar.textContent = item.name.slice(0, 1).toUpperCase();
    const body = document.createElement('div');
    const head = document.createElement('div'); head.className = 'chat-message-head';
    const name = document.createElement('strong'); name.textContent = item.name;
    const date = new Date(item.at);
    const time = document.createElement('time'); time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = document.createElement('p'); text.className = 'chat-message-text'; text.textContent = item.text;
    head.append(name, time); body.append(head, text); row.append(avatar, body); return row;
  }));
  ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

function renderVoiceChannel() {
  if (!ui.voiceRoster) return;
  const users = memberList.filter((m) => m.voiceChannel === VOICE_CHANNEL);
  ui.voiceChannelCount.textContent = String(users.length);
  ui.voiceRoster.replaceChildren(...users.map((m) => {
    const item = document.createElement('li'); item.textContent = m.name + (m.id === myId ? ' (você)' : '');
    if (m.id === myId) item.classList.add('self');
    return item;
  }));
  const joined = voiceChannel === VOICE_CHANNEL;
  ui.voiceToggleBtn.textContent = joined ? 'Sair do canal de voz' : 'Entrar no canal de voz';
  ui.voiceToggleBtn.classList.toggle('danger', joined);
  ui.voicePanelHint.textContent = joined ? (voiceMode === 'ptt'
    ? (micMuted ? `Push to talk ativo · segure ${formatHotkey(pushToTalkCode)} para falar.` : 'Microfone transmitindo enquanto a tecla está pressionada.')
    : (micMuted ? 'Você está conectado com o microfone desligado.' : 'Seu microfone está conectado ao canal.')) : 'Entre no canal para conversar com quem está na sala.';
  ui.micBtn.hidden = !joined;
  ui.micBtn.textContent = voiceMode === 'ptt' ? (micMuted ? '🎙' : '🔴') : (micMuted ? '🔇' : '🎙');
  ui.micBtn.title = voiceMode === 'ptt' ? `Segure para falar · ${formatHotkey(pushToTalkCode)}` : (micMuted ? 'Ativar microfone' : 'Silenciar microfone');
  ui.micBtn.setAttribute('aria-label', ui.micBtn.title);
}

async function enterVoice() {
  if (voiceChannel === VOICE_CHANNEL) { leaveVoice(); return; }
  try {
    const audio = { ...audioProcessing };
    if (selectedMicrophone) audio.deviceId = { exact: selectedMicrophone };
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    voiceChannel = VOICE_CHANNEL;
    micMuted = voiceMode === 'ptt';
    for (const track of voiceStream.getAudioTracks()) track.enabled = !micMuted;
    sendToOwner({ t: 'voice-join', channel: VOICE_CHANNEL });
  } catch (err) {
    if (err && err.name === 'NotAllowedError') toast('Permita o acesso ao microfone para entrar no canal de voz.');
    else if (err && err.name === 'OverconstrainedError') toast('O microfone escolhido não está disponível. Abra Configurar áudio e selecione outro.');
    else toast('Não consegui acessar o microfone. Confira as permissões e o dispositivo de áudio.');
  }
  renderVoiceChannel();
}

function leaveVoice() {
  if (voiceChannel && inRoom) sendToOwner({ t: 'voice-leave', channel: VOICE_CHANNEL });
  voiceChannel = null;
  voiceRoster = [];
  for (const id of [...voiceCalls.keys()]) closeVoiceCall(id);
  if (voiceStream) { voiceStream.getTracks().forEach((track) => track.stop()); voiceStream = null; }
  micMuted = false;
  renderVoiceChannel();
}

function syncVoiceCalls() {
  const allowed = new Set(voiceRoster.map((u) => u.id));
  for (const id of [...voiceCalls.keys()]) if (!allowed.has(id)) closeVoiceCall(id);
  if (!voiceStream || voiceChannel !== VOICE_CHANNEL) return;
  for (const user of voiceRoster) {
    if (user.id !== myId && myId < user.id && !voiceCalls.has(user.id)) callVoiceUser(user.id);
  }
}

function callVoiceUser(id) {
  const call = peer && peer.call(id, voiceStream, { metadata: { kind: 'voice' }, sdpTransform: tuneSdp });
  if (!call) return;
  attachVoiceCall(id, call);
}

function attachVoiceCall(id, call) {
  closeVoiceCall(id);
  voiceCalls.set(id, call);
  call.on('stream', (stream) => {
    if (voiceCalls.get(id) !== call) return;
    let audio = voiceAudio.get(id);
    if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.dataset.peer = id; document.body.append(audio); voiceAudio.set(id, audio); }
    if (selectedSpeaker && typeof audio.setSinkId === 'function') audio.setSinkId(selectedSpeaker).catch(() => toast('Não consegui usar a saída de áudio escolhida.'));
    audio.srcObject = stream;
    audio.play().catch(() => toast('Clique na janela para liberar o áudio do canal de voz.'));
  });
  call.on('close', () => closeVoiceCall(id, call));
  call.on('error', () => closeVoiceCall(id, call));
}

function closeVoiceCall(id, expected) {
  const call = voiceCalls.get(id);
  if (expected && call !== expected) return;
  if (call) { voiceCalls.delete(id); try { call.close(); } catch {} }
  const audio = voiceAudio.get(id);
  if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); voiceAudio.delete(id); }
}

document.querySelectorAll('.channel-select').forEach((button) => { button.onclick = () => selectChannel(button.dataset.channel); });
ui.voiceChannelBtn.onclick = () => { selectChannel(VOICE_CHANNEL); if (voiceChannel !== VOICE_CHANNEL) enterVoice(); };
ui.voiceToggleBtn.onclick = enterVoice;
ui.micBtn.onclick = () => {
  if (voiceMode === 'ptt') return;
  micMuted = !micMuted;
  if (voiceStream) for (const track of voiceStream.getAudioTracks()) track.enabled = !micMuted;
  renderVoiceChannel();
};
ui.micBtn.onpointerdown = (event) => { if (voiceMode === 'ptt') { event.preventDefault(); ui.micBtn.setPointerCapture(event.pointerId); setPushToTalk(true); } };
ui.micBtn.onpointerup = () => setPushToTalk(false);
ui.micBtn.onpointercancel = () => setPushToTalk(false);
ui.chatForm.onsubmit = (event) => {
  event.preventDefault();
  const text = ui.chatInput.value.trim().slice(0, 500);
  if (!text || !TEXT_CHANNELS.has(activeChannel)) return;
  ui.chatInput.value = '';
  sendToOwner({ t: 'chat-send', channel: activeChannel, text });
};

// ---------- Assistir ----------

function selectMember(id) {
  if (id === watching) return;
  stopWatching();
  watching = id;
  if (id !== myId) askToWatch(id);
  renderMembers();
  showStage();
}
function askToWatch(id) { watchAskedAt = Date.now(); sendToOwner({ t: 'watch', target: id }); }
function stopWatching() {
  if (watching && watching !== myId && inRoom) sendToOwner({ t: 'unwatch', target: watching });
  closeIncoming();
  watching = null;
  if (inRoom) { renderMembers(); showStage(); }
}
function closeIncoming() {
  if (!incoming) return;
  const call = incoming;
  incoming = null;
  try { call.close(); } catch {}
  clearInterval(statsTimer);
  ui.stats.textContent = '';
  showStage();
}

function setupMedia(p) {
  p.on('call', (call) => {
    if (call.metadata && call.metadata.kind === 'voice') {
      if (!voiceStream || voiceChannel !== VOICE_CHANNEL || !voiceRoster.some((u) => u.id === call.peer)) { call.close(); return; }
      call.answer(voiceStream, { sdpTransform: tuneSdp });
      attachVoiceCall(call.peer, call);
      return;
    }
    // Só atende quem eu escolhi assistir; qualquer outra chamada é recusada.
    if (!call.metadata || call.metadata.kind !== 'share' || call.peer !== watching) { call.close(); return; }
    closeIncoming();
    incoming = call;
    call.answer(undefined, { sdpTransform: tuneSdp });
    call.on('stream', (stream) => {
      if (incoming !== call) return;
      ui.video.srcObject = stream;
      ui.video.muted = false;
      ui.video.play().catch(() => {});
      showStage();
      startStats(call);
    });
    call.on('close', () => {
      if (incoming !== call) return;
      incoming = null;
      clearInterval(statsTimer);
      ui.stats.textContent = '';
      showStage();
    });
  });
}

function showStage() {
  const target = memberList.find((m) => m.id === watching);
  let msg = '';
  let video = null;
  if (!watching || !target) {
    ui.watchTitle.textContent = 'Nenhuma transmissão selecionada';
    msg = memberList.some((m) => m.streaming)
      ? 'Escolha uma pessoa que esteja transmitindo para assistir.'
      : 'Ninguém está transmitindo agora. Clique em "Compartilhar tela" para começar.';
  } else if (watching === myId) {
    ui.watchTitle.textContent = 'Sua transmissão (prévia sem som)';
    if (localStream) video = localStream; else msg = 'Você não está transmitindo.';
  } else {
    ui.watchTitle.textContent = 'Assistindo ' + target.name;
    if (!target.streaming) msg = target.name + ' parou de transmitir. Assim que voltar, aparece aqui.';
    else if (incoming && ui.video.srcObject) video = ui.video.srcObject;
    else msg = 'Conectando com ' + target.name + '...';
  }
  if (video) {
    if (ui.video.srcObject !== video) ui.video.srcObject = video;
    ui.video.muted = watching === myId || ui.video.dataset.muted === '1';
    if (ui.video.paused) ui.video.play().catch(() => {});
    ui.video.hidden = false;
    ui.controls.hidden = watching === myId;
    ui.stageEmpty.hidden = true;
  } else {
    ui.video.srcObject = null;
    ui.video.hidden = true;
    ui.controls.hidden = true;
    ui.stageEmpty.hidden = false;
    ui.stageMsg.textContent = msg;
  }
}

function startStats(call) {
  clearInterval(statsTimer);
  let lastBytes = 0, lastTime = 0;
  statsTimer = setInterval(async () => {
    const pc = call.peerConnection;
    if (!pc) return;
    const report = await pc.getStats();
    let video = null;
    const codecs = new Map();
    report.forEach((s) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video') video = s;
      if (s.type === 'codec') codecs.set(s.id, s.mimeType);
    });
    if (!video) return;
    const mbps = lastTime ? ((video.bytesReceived - lastBytes) * 8) / ((video.timestamp - lastTime) * 1000) : 0;
    lastBytes = video.bytesReceived; lastTime = video.timestamp;
    const parts = [];
    if (video.frameHeight) parts.push(video.frameHeight + 'p');
    if (video.framesPerSecond) parts.push(Math.round(video.framesPerSecond) + ' fps');
    if (mbps) parts.push(mbps.toFixed(1) + ' Mbps');
    const codec = (codecs.get(video.codecId) || '').replace('video/', '');
    if (codec) parts.push(codec);
    ui.stats.textContent = parts.join(' · ');
  }, 1000);
}

ui.volume.oninput = () => {
  ui.video.volume = Number(ui.volume.value);
  if (ui.video.volume > 0 && ui.video.muted) toggleMute(false);
};
ui.muteBtn.onclick = () => toggleMute(!ui.video.muted);
function toggleMute(muted) {
  ui.video.muted = muted;
  ui.video.dataset.muted = muted ? '1' : '';
  ui.muteBtn.textContent = muted ? '🔇' : '🔊';
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else ui.stage.requestFullscreen().catch(() => {});
}
ui.fullBtn.onclick = toggleFullscreen;
ui.stage.addEventListener('dblclick', () => { if (!ui.video.hidden) toggleFullscreen(); });
let idleTimer = null;
ui.stage.addEventListener('mousemove', () => {
  ui.stage.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => ui.stage.classList.add('idle'), 2500);
});

// ---------- Transmitir ----------

let sources = [], sourceKind = 'window', chosenSource = null;

ui.shareBtn.onclick = () => { if (localStream) stopShare(false); else openShareModal(); };

async function openShareModal() {
  await platformReady;
  chosenSource = null;
  ui.confirmShare.disabled = true;
  ui.sourceGrid.replaceChildren();
  ui.shareModal.hidden = false;
  ui.tabs.hidden = ui.sourceGrid.hidden = wayland;
  ui.waylandNote.hidden = !wayland;
  const [srcs, apps] = await Promise.all([window.safezone.getSources().catch(() => []), window.safezone.listApps().catch(() => [])]);
  sources = Array.isArray(srcs) ? srcs : [];
  fillApps(Array.isArray(apps) ? apps : []);
  if (wayland) { chosenSource = { portal: true, screen: false, name: '' }; ui.confirmShare.disabled = false; }
  else renderSources();
}

function fillApps(apps) {
  if (isWindows) {
    ui.appSelect.replaceChildren(new Option('Som do sistema (todas as aplicações)', 'system'), new Option('Sem som', ''));
    ui.appSelect.value = 'system';
    ui.audioLabel.textContent = 'Áudio da transmissão';
    ui.audioHint.textContent = 'No Windows, o áudio capturado inclui todos os sons do sistema, inclusive chamadas e notificações. Selecione “Sem som” para transmitir sem áudio.';
    return;
  }
  ui.audioLabel.textContent = 'Som de qual programa?';
  ui.audioHint.textContent = 'Só o som do programa escolhido vai para a sala — a voz do Discord não vaza. Netflix, Prime e Disney+ no navegador podem aparecer pretos por causa da proteção contra cópia.';
  ui.appSelect.replaceChildren(new Option('Sem som', ''));
  apps.sort((a, b) => a.name.localeCompare(b.name));
  for (const a of apps) {
    const label = a.name + (a.title ? ' — ' + (a.title.length > 60 ? a.title.slice(0, 57) + '...' : a.title) : '');
    const opt = new Option(label, a.id);
    opt.dataset.app = a.name;
    opt.dataset.title = a.title;
    ui.appSelect.append(opt);
  }
}

function renderSources() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.kind === sourceKind));
  const list = sources.filter((s) => (sourceKind === 'screen') === s.screen);
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nada para mostrar aqui.';
    ui.sourceGrid.replaceChildren(p);
    return;
  }
  ui.sourceGrid.replaceChildren(...list.map((s) => {
    const btn = document.createElement('button');
    btn.className = 'source' + (chosenSource === s ? ' selected' : '');
    const img = document.createElement('img');
    img.src = s.thumb;
    const name = document.createElement('span');
    name.textContent = s.name;
    name.title = s.name;
    btn.append(img, name);
    btn.onclick = () => pickSource(s);
    btn.ondblclick = () => { pickSource(s); confirmShare(); };
    return btn;
  }));
}

// Ao escolher uma janela, já marca o som do programa com nome ou título parecido.
function pickSource(s) {
  chosenSource = s;
  ui.confirmShare.disabled = false;
  if (!s.screen) {
    const wn = s.name.toLowerCase();
    const hit = (v) => v && v.length > 2 && wn.includes(v.toLowerCase());
    const match = [...ui.appSelect.options].find((o) => o.value && (hit(o.dataset.title) || hit(o.dataset.app)));
    if (match) ui.appSelect.value = match.value;
  }
  renderSources();
}

document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { sourceKind = t.dataset.kind; renderSources(); }; });
ui.cancelShare.onclick = () => { ui.shareModal.hidden = true; };
ui.confirmShare.onclick = () => confirmShare();

async function confirmShare() {
  if (!chosenSource) return;
  const source = chosenSource;
  const appId = ui.appSelect.value || null;
  quality = QUALITIES[ui.qualitySelect.value] || QUALITIES['720'];
  try { localStorage.setItem('safezone-quality', ui.qualitySelect.value); } catch {}
  ui.shareModal.hidden = true;
  try { await startShare(source, appId); }
  catch (err) {
    console.error(err);
    stopShare(true);
    toast('Não deu para compartilhar: ' + (err.message || err));
  }
}

async function captureSource(source, captureSystemAudio) {
  const attempts = [
    { video: { width: { max: quality.width }, height: { max: quality.height }, frameRate: { ideal: 60, max: 60 } }, audio: captureSystemAudio },
    { video: true, audio: captureSystemAudio },
  ];
  let lastError = null;
  for (const constraints of attempts) {
    try {
      if (!source.portal) await window.safezone.selectSource(source.id);
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) { console.warn('captura', err.name); lastError = err; }
  }
  throw new Error('o sistema não deixou capturar ' + (source.screen ? 'essa tela' : 'essa janela') + ' (' + (lastError && lastError.message) + ').');
}

async function startShare(source, appId) {
  const captureSystemAudio = isWindows && appId === 'system';
  const stream = await captureSource(source, captureSystemAudio);
  const [videoTrack] = stream.getVideoTracks();
  const settings = videoTrack.getSettings();
  if (settings.width > quality.width || settings.height > quality.height) {
    await videoTrack.applyConstraints({ width: { max: quality.width }, height: { max: quality.height }, frameRate: { max: 60 } }).catch(() => {});
  }
  videoTrack.contentHint = 'motion';
  videoTrack.onended = () => stopShare(false);
  if (appId && !isWindows) {
    try { audioPipe = await startAudioPipe(appId); }
    catch (err) { stream.getTracks().forEach((t) => t.stop()); throw err; }
    stream.addTrack(audioPipe.track);
  }
  localStream = stream;
  sendToOwner({ t: 'streaming', on: true });
  updateShareUi();
  if (!watching) selectMember(myId); else showStage();
}

function stopShare(silent) {
  for (const id of [...outgoing.keys()]) closeOutgoing(id);
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (audioPipe) { audioPipe.stop(); audioPipe = null; }
  if (inRoom && !silent) sendToOwner({ t: 'streaming', on: false });
  if (watching === myId) { watching = null; if (inRoom) renderMembers(); }
  updateShareUi();
  if (inRoom) showStage();
}

function updateShareUi() {
  const live = !!localStream;
  ui.shareBtn.textContent = live ? 'Parar transmissão' : 'Compartilhar tela';
  ui.shareBtn.classList.toggle('primary', !live);
  ui.shareBtn.classList.toggle('danger', live);
  ui.shareStatus.hidden = !live;
  ui.shareStatus.textContent = outgoing.size === 0 ? 'Ao vivo' : 'Ao vivo · ' + outgoing.size + ' assistindo';
  ui.shareIdle.hidden = live;
}

function callViewer(viewerId) {
  closeOutgoing(viewerId);
  const call = peer.call(viewerId, localStream, { metadata: { kind: 'share' }, sdpTransform: tuneSdp });
  if (!call) return;
  outgoing.set(viewerId, call);
  const pc = call.peerConnection;
  pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'connected') tuneSenders(pc); });
  call.on('close', () => { if (outgoing.get(viewerId) === call) { outgoing.delete(viewerId); updateShareUi(); } });
  call.on('error', () => closeOutgoing(viewerId));
  updateShareUi();
}
function closeOutgoing(id) {
  const call = outgoing.get(id);
  if (!call) return;
  outgoing.delete(id);
  try { call.close(); } catch {}
  updateShareUi();
}

// ---------- Som de um programa só ----------

let audioCtx = null, workletReady = null, pcmLeftover = null, currentNode = null;

async function startAudioPipe(appId) {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    workletReady = audioCtx.audioWorklet.addModule('audio-worklet.js');
  }
  await workletReady;
  await audioCtx.resume();
  const node = new AudioWorkletNode(audioCtx, 'pcm-player', { outputChannelCount: [2] });
  const dest = audioCtx.createMediaStreamDestination();
  dest.channelCount = 2;
  node.connect(dest);
  pcmLeftover = null;
  currentNode = node;
  const result = await window.safezone.startAudio(appId);
  if (!result.ok) { node.disconnect(); currentNode = null; throw new Error(result.error); }
  const [track] = dest.stream.getAudioTracks();
  return {
    track,
    stop() {
      window.safezone.stopAudio();
      if (currentNode === node) currentNode = null;
      node.disconnect();
      track.stop();
    },
  };
}

window.safezone.onAudio((chunk) => {
  if (!currentNode || !(chunk instanceof Uint8Array)) return;
  let bytes = chunk;
  if (pcmLeftover) {
    const joined = new Uint8Array(pcmLeftover.length + chunk.length);
    joined.set(pcmLeftover);
    joined.set(chunk, pcmLeftover.length);
    bytes = joined;
    pcmLeftover = null;
  }
  const usable = bytes.length - (bytes.length % 4); // cada amostra estéreo de 16 bits tem 4 bytes
  if (usable < bytes.length) pcmLeftover = bytes.slice(usable);
  const copy = bytes.slice(0, usable);
  const ints = new Int16Array(copy.buffer, copy.byteOffset, usable / 2);
  const floats = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) floats[i] = ints[i] / 32768;
  currentNode.port.postMessage(floats, [floats.buffer]);
});
window.safezone.onAudioEnded(() => { if (audioPipe && localStream) toast('O programa do som fechou. A imagem continua sem som.'); });

// ---------- Qualidade ----------

// Opus estéreo com bitrate alto (o padrão é mono, pensado para voz), vídeo começando forte e H264 na frente.
function tuneSdp(sdp) {
  const opus = (sdp.match(/a=rtpmap:(\d+) opus\/48000/i) || [])[1];
  let section = '';
  return preferH264(sdp).split('\r\n').map((line) => {
    if (line.startsWith('m=')) section = line.slice(2).split(' ')[0];
    if (opus && line.startsWith('a=fmtp:' + opus + ' ')) {
      return setFmtp(line, { stereo: 1, 'sprop-stereo': 1, maxaveragebitrate: AUDIO_BITRATE, useinbandfec: 1, usedtx: 0, cbr: 0 });
    }
    if (section === 'video' && /^a=fmtp:\d+ /.test(line) && !line.includes('apt=')) {
      return setFmtp(line, { 'x-google-start-bitrate': Math.round(quality.bitrate * 0.6 / 1000), 'x-google-max-bitrate': quality.bitrate / 1000 });
    }
    return line;
  }).join('\r\n');
}

function setFmtp(line, values) {
  const space = line.indexOf(' ');
  const head = line.slice(0, space);
  const params = new Map(line.slice(space + 1).split(';').filter(Boolean).map((p) => {
    const eq = p.indexOf('=');
    return eq < 0 ? [p.trim(), ''] : [p.slice(0, eq).trim(), p.slice(eq + 1)];
  }));
  for (const [k, v] of Object.entries(values)) params.set(k, String(v));
  return head + ' ' + [...params].map(([k, v]) => (v === '' ? k : k + '=' + v)).join(';');
}

function preferH264(sdp) {
  return sdp.split(/(?=\r\nm=)/).map((part) => {
    const mline = part.match(/m=video [^\r\n]+/);
    if (!mline) return part;
    const [m, port, proto, ...pts] = mline[0].split(' ');
    const rank = (pt) => {
      if (!/^\d+$/.test(pt)) return 6;
      const codec = ((part.match(new RegExp('a=rtpmap:' + pt + ' ([^/\\r\\n]+)')) || [])[1] || '').toUpperCase();
      const fmtp = (part.match(new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]+)')) || [])[1] || '';
      if (codec === 'H264') return (fmtp.includes('packetization-mode=1') ? 0 : 2) + (fmtp.includes('profile-level-id=64') ? 0 : 1);
      if (codec === 'VP9') return 4;
      if (codec === 'VP8') return 5;
      return 6;
    };
    const sorted = pts.map((pt, i) => [pt, rank(pt), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
    return part.replace(mline[0], [m, port, proto, ...sorted].join(' '));
  }).join('');
}

async function tuneSenders(pc) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    const enc = params.encodings[0];
    if (sender.track.kind === 'video') {
      enc.maxBitrate = quality.bitrate;
      enc.maxFramerate = 60;
      enc.priority = 'high';
      enc.networkPriority = 'high';
      params.degradationPreference = 'maintain-resolution';
    } else {
      enc.maxBitrate = AUDIO_BITRATE;
      enc.priority = 'high';
      enc.networkPriority = 'high';
    }
    try { await sender.setParameters(params); } catch (err) { console.warn('setParameters', err.name); }
  }
}

// ---------- Aviso rápido ----------

let toastTimer = null;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3500);
}
