# Changelog

## 1.3.0
- Instalador por usuário para Windows; no Linux, instalação pelo `install.sh` incluído no pacote.
- Seleção de microfone e saída de áudio, com detecção do backend disponível.
- Verificação manual de atualizações e acesso à release oficial do GitHub dentro do app.

## 1.2.0
- Apelido informado antes de entrar na sala e referências antigas removidas da documentação.
- Dois canais de texto e um canal de voz, com controles de microfone.

## 1.1.0
- Adicionada versão portátil para Windows 10/11 x64, publicada como ZIP com checksum SHA-256.
- Pacotes Linux x64 e Windows x64 publicados na mesma release, acompanhados de checksum SHA-256; o pacote Linux inclui SBOM CycloneDX.
- Captura de áudio no Windows usa loopback do sistema inteiro; é possível transmitir sem áudio. O áudio não é isolado por programa nessa plataforma.
- Adicionada publicação automatizada de release Windows a partir do versionamento no `package.json`.
- Documentadas instalação, privacidade e limitações específicas de áudio no Windows.

## 1.0.0
- Primeira versão do SafeZone para Linux.
- Som por programa via `pactl` + `parec --monitor-stream` (PulseAudio/PipeWire), no lugar do capturador do Windows.
- Removido o `electron-builder` (origem do CVE do `minimatch`); empacotamento por `scripts/package-linux.sh`.
- Endurecimento do Electron: sandbox, CSP, bloqueio de rede, permissões e navegação; IPC validado.
- Credenciais TURN deixam de ser empacotadas.
- Código da sala com 8 caracteres; mensagens da sala validadas; limite de 12 pessoas.
- Suporte a captura de tela no Wayland via portal.
