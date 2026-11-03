#!/bin/sh
# Monta build/safezone-<versão>-linux-x64.tar.gz com o Electron já baixado pelo npm + o app. Sem electron-builder.
set -eu
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"
ELECTRON_DIST="node_modules/electron/dist"
[ -x "$ELECTRON_DIST/electron" ] || { echo "Electron não encontrado. Rode: npm ci"; exit 1; }

node scripts/vendor.js
node --test test/*.test.js

NAME="safezone-${VERSION}-linux-x64"
OUT="build/${NAME}"
rm -rf build
mkdir -p "$OUT/resources/app"

cp -a "$ELECTRON_DIST"/. "$OUT"/
mv "$OUT/electron" "$OUT/safezone-bin"
rm -f "$OUT/resources/default_app.asar"

cp main.js preload.js "$OUT/resources/app/"
cp -r lib src "$OUT/resources/app/"
node -e "const p=require('./package.json');require('fs').writeFileSync(process.argv[1],JSON.stringify({name:p.name,version:p.version,main:'main.js',description:p.description},null,2))" "$OUT/resources/app/package.json"

cp scripts/safezone.sh "$OUT/safezone"
cp scripts/install.sh "$OUT/install.sh"
cp README.md SECURITY.md CHANGELOG.md "$OUT"/
chmod 755 "$OUT/safezone" "$OUT/install.sh" "$OUT/safezone-bin"

[ -f package-lock.json ] && node scripts/sbom.js && cp build/sbom.cdx.json "$OUT/sbom.cdx.json" || true

tar -C build -czf "build/${NAME}.tar.gz" "$NAME"
( cd build && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )
echo "Pronto: build/${NAME}.tar.gz"
