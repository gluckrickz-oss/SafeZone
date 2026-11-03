#!/bin/sh
# Instala o SafeZone só para o seu usuário (~/.local). Não precisa de root, exceto no passo do sandbox, se necessário.
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.local/share/safezone"

for c in pactl parec; do
  command -v "$c" >/dev/null 2>&1 || echo "AVISO: '$c' não encontrado. Instale pulseaudio-utils (ou pipewire-pulse) para o som por programa."
done

rm -rf "$DEST"
mkdir -p "$DEST" "${HOME}/.local/bin" "${HOME}/.local/share/applications"
cp -a "$SRC"/. "$DEST"/
rm -f "$DEST/install.sh"
ln -sf "$DEST/safezone" "${HOME}/.local/bin/safezone"

cat > "${HOME}/.local/share/applications/safezone.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=SafeZone
Comment=Assista filmes e séries juntos, com o som de um programa só
Exec=${DEST}/safezone
Terminal=false
Categories=AudioVideo;Network;
DESK

# O sandbox do Chromium precisa de user namespaces sem privilégio OU do chrome-sandbox com setuid root.
if ! unshare -Ur true >/dev/null 2>&1; then
  echo "Seu sistema bloqueia user namespaces sem privilégio. Ajustando o chrome-sandbox (pede sudo)..."
  sudo chown root:root "$DEST/chrome-sandbox"
  sudo chmod 4755 "$DEST/chrome-sandbox"
fi
echo "Pronto. Abra o SafeZone pelo menu de aplicativos ou rodando: safezone"
