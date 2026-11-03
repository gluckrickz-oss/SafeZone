'use strict';
// Copia o único arquivo do PeerJS que o app usa para src/vendor/. O app empacotado não leva node_modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const src = path.join(__dirname, '..', 'node_modules', 'peerjs', 'dist', 'peerjs.min.js');
const dst = path.join(__dirname, '..', 'src', 'vendor', 'peerjs.min.js');
if (!fs.existsSync(src)) { console.error('PeerJS não instalado. Rode: npm ci (ou npm install)'); process.exit(1); }
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('vendor/peerjs.min.js sha256:', crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex'));
