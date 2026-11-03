'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error('Este empacotador deve rodar no Windows x64.');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronExecutable = require('electron');
const electronDist = path.dirname(electronExecutable);
const name = `safezone-${pkg.version}-windows-x64`;
const out = path.join(root, 'build', name);
const appOut = path.join(out, 'resources', 'app');

if (!fs.existsSync(electronExecutable)) {
  const electronRoot = path.dirname(require.resolve('electron/package.json'));
  let contents = [];
  try { contents = fs.readdirSync(electronRoot); } catch {}
  console.error(`Executável do Electron não encontrado em ${electronExecutable}. Conteúdo do pacote: ${contents.join(', ') || '(vazio)'}`);
  console.error('Rode npm ci em um ambiente Windows x64 e confira se a etapa de instalação do Electron foi concluída.');
  process.exit(1);
}

execFileSync(process.execPath, ['scripts/vendor.js'], { cwd: root, stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(electronDist, out, { recursive: true });
fs.renameSync(path.join(out, 'electron.exe'), path.join(out, 'SafeZone.exe'));
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
fs.rmSync(path.join(out, 'resources', 'default_app'), { recursive: true, force: true });
fs.mkdirSync(appOut, { recursive: true });

for (const file of ['main.js', 'preload.js']) fs.copyFileSync(path.join(root, file), path.join(appOut, file));
for (const dir of ['lib', 'src']) fs.cpSync(path.join(root, dir), path.join(appOut, dir), { recursive: true });
for (const file of ['README.md', 'SECURITY.md', 'CHANGELOG.md', 'INSTALL-WINDOWS.md']) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}

fs.writeFileSync(path.join(appOut, 'package.json'), JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  main: 'main.js',
  description: pkg.description,
}, null, 2) + '\n');

console.log(`Pronto: build/${name}/SafeZone.exe`);
