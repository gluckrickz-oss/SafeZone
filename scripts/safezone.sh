#!/bin/sh
# Launcher do SafeZone. Limpa variáveis que fariam o Electron virar um "node" qualquer.
DIR="$(dirname "$(readlink -f "$0")")"
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS ELECTRON_EXTRA_LAUNCH_ARGS
if [ "${SAFEZONE_NO_SANDBOX:-}" = "1" ]; then
  echo "AVISO: SafeZone sem sandbox (SAFEZONE_NO_SANDBOX=1). Use só para diagnóstico." >&2
  set -- --no-sandbox "$@"
fi
exec "$DIR/safezone-bin" "$@"
