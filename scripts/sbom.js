'use strict';
// Gera um SBOM CycloneDX 1.5 a partir do package-lock.json (rode depois de npm install).
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const lockFile = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockFile)) { console.error('package-lock.json não existe. Rode: npm install'); process.exit(1); }
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const components = Object.entries(lock.packages || {}).filter(([k]) => k).map(([k, v]) => {
  const name = v.name || k.replace(/^.*node_modules\//, '');
  const c = {
    type: 'library', name, version: v.version,
    purl: 'pkg:npm/' + (name.startsWith('@') ? '%40' + name.slice(1) : name) + '@' + v.version,
    scope: v.dev ? 'optional' : 'required',
  };
  if (typeof v.integrity === 'string' && v.integrity.startsWith('sha512-')) {
    c.hashes = [{ alg: 'SHA-512', content: Buffer.from(v.integrity.slice(7), 'base64').toString('hex') }];
  }
  return c;
});

const bom = {
  bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
  metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: pkg.name, version: pkg.version } },
  components,
};
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'sbom.cdx.json'), JSON.stringify(bom, null, 2));
console.log('build/sbom.cdx.json:', components.length, 'componentes');
