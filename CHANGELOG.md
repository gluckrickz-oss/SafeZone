# Changelog

## 1.0.0
- Primeira versão do SafeZone, derivada do Isekai, para Linux.
- Som por programa via `pactl` + `parec --monitor-stream` (PulseAudio/PipeWire), no lugar do capturador do Windows.
- Removido o `electron-builder` (origem do CVE do `minimatch`); empacotamento por `scripts/package-linux.sh`.
- Endurecimento do Electron: sandbox, CSP, bloqueio de rede, permissões e navegação; IPC validado.
- Credenciais TURN deixam de ser empacotadas.
- Código da sala com 8 caracteres; mensagens da sala validadas; limite de 12 pessoas.
- Suporte a captura de tela no Wayland via portal.
