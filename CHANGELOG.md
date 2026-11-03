# Changelog

## 1.3.4
- Corrigida abertura no Windows: removida a exclusão nativa da janela principal via SetWindowDisplayAffinity, que podia deixá-la invisível após iniciar ou reexibir.

## 1.3.3
- No Windows, a janela principal agora aparece imediatamente ao iniciar, em vez de esperar pelo evento de renderização; falhas de carregamento também mostram e focam a janela com o diagnóstico.

## 1.3.2
- Abre a janela somente após a interface estar pronta e mostra um erro visível se o carregamento falhar.
- No Windows, o botão de atualização baixa o instalador, valida o SHA-256 e inicia a atualização sem abrir a página do GitHub.
- Corrigida a cópia dos convites de 13 caracteres.

## 1.3.1
- Aumentado o convite de sala para 13 caracteres aleatórios; versões antigas e novas exigem a mesma versão entre participantes.
- Mantido apenas o canal de texto `#geral`, sem histórico retido ou enviado a quem entrar depois.
- Microfone silenciado por padrão ao entrar no canal de voz; adicionado push to talk configurável e filtros de áudio.
- Bloqueadas cópia de texto e impressão; adicionada proteção do sistema contra captura no Windows e tela preta temporária ao perder foco.
- O lançamento desta versão gera pacotes Linux e Windows com o número reconhecido pelo verificador de atualizações.

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
