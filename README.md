# SafeZone 1.2.0 (Linux e Windows)

Assista e converse com os amigos: crie uma sala, compartilhe o código e use os canais de texto e voz. No Linux, você escolhe o programa cujo áudio será enviado; no Windows, pode enviar o áudio do sistema inteiro ou nenhum áudio.

O SafeZone é multiplataforma, com superfície de ataque reduzida e foco em ter poucas dependências.

## Downloads

- [Baixar para Linux x64 (.tar.gz)](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-linux-x64.tar.gz)
- [SHA-256 do pacote Linux](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-linux-x64.tar.gz.sha256)
- [Baixar para Windows 10/11 x64 (ZIP)](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-windows-x64.zip)
- [SHA-256 do pacote Windows](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-windows-x64.zip.sha256)
- [Todas as versões e notas de lançamento](https://github.com/gluckrickz-oss/SafeZone/releases)

## Requisitos Linux

- Linux x86_64 com PulseAudio ou PipeWire (com `pipewire-pulse`)
- `pactl` e `parec` (pacote `pulseaudio-utils` no Debian/Ubuntu; `libpulse` no Arch/Fedora)
- Para compartilhar a tela no Wayland: PipeWire + `xdg-desktop-portal` do seu ambiente (GNOME, KDE...)

## Instalar (pacote pronto)

Baixe o [pacote Linux x64](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-linux-x64.tar.gz) e o [checksum SHA-256](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-linux-x64.tar.gz.sha256):

```bash
tar xzf safezone-1.2.0-linux-x64.tar.gz
cd safezone-1.2.0-linux-x64
./install.sh
safezone
```

O `install.sh` instala só para o seu usuário em `~/.local`. Ele só pede `sudo` se o seu sistema bloquear o sandbox do Chromium (caso do Ubuntu 24.04): nesse caso ajusta o `chrome-sandbox` (setuid root). O sandbox fica **ligado**. Só use `SAFEZONE_NO_SANDBOX=1 safezone` para diagnóstico.

## Instalar no Windows

Baixe [SafeZone 1.2.0 para Windows x64](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-windows-x64.zip), extraia o ZIP e abra `SafeZone.exe`. O pacote é portátil, não precisa de instalador nem de privilégios de administrador. A versão não é assinada e o Windows pode exibir o aviso do SmartScreen; confira o [SHA-256](https://github.com/gluckrickz-oss/SafeZone/releases/latest/download/safezone-1.2.0-windows-x64.zip.sha256) antes de abrir.

## Rodar a partir do código

```bash
npm ci            # instala as versões exatas registradas no package-lock.json
npm test          # testes do leitor de áudio
npm start         # abre o app (precisa do chrome-sandbox configurado)
npm run start:dev # abre sem sandbox: só para desenvolvimento
npm run package:linux   # gera build/safezone-<versão>-linux-x64.tar.gz + .sha256
npm run package:windows # gera a pasta portátil em build/ (rode em Windows x64)
npm run sbom      # gera build/sbom.cdx.json (CycloneDX)
npm run audit     # npm audit
```

## Como usar

1. Escolha seu apelido antes de criar uma sala ou entrar com um código de convite.
2. Use `#geral` e `#filmes` para conversar por texto. As mensagens ficam na memória do computador que criou a sala.
3. Entre em `voz-geral` e permita o microfone; o botão 🎙 silencia e ativa sua voz.
4. Para assistir, clique em **Compartilhar tela**, escolha a janela e o áudio. Para ver a transmissão, selecione quem está transmitindo.

A lista de programas com som mostra só quem está tocando áudio **agora** no Linux: dê play no player antes de abrir "Compartilhar tela".

No Windows, a captura de áudio oferece o som do sistema inteiro (todas as aplicações) ou transmissão sem som. Ela não isola um programa específico; chamadas, notificações e outros sons também podem ser incluídos. Silencie o que não quiser transmitir.

### Avisos

- Netflix, Prime e Disney+ no navegador aparecem pretos (proteção contra cópia).
- A sala fica no PC de quem criou: se essa pessoa fechar o SafeZone, a sala acaba.
- As salas aceitam até 12 pessoas. A voz usa conexões diretas entre participantes do canal; a qualidade depende da rede e dos microfones disponíveis.

## Como o som de um programa só funciona no Linux

`pactl` lista os streams de áudio (cada programa tocando é um "sink input") e `parec --monitor-stream=N` grava **somente** o stream escolhido, sem mexer nas suas saídas: você continua ouvindo normalmente e a voz do Discord não entra, a menos que você escolha o Discord. O PCM (16 bits, 48 kHz, estéreo) vai para um AudioWorklet e vira a faixa de áudio da transmissão WebRTC (Opus estéreo, 256 kbps).

## Segurança

- O app usa sandbox, CSP restrita e validação das mensagens recebidas.
- O código da sala tem 8 caracteres; as salas aceitam até 12 pessoas.
- O token TURN nunca é incluído no repositório nem no pacote.
- A janela só acessa o servidor de sinalização PeerJS e recursos locais do app.

## TURN opcional

Se a internet de alguém bloqueia a conexão direta, crie `turn.json` no perfil do app: `~/.config/SafeZone/turn.json` no Linux ou `%APPDATA%\SafeZone\turn.json` no Windows:

```json
{ "keyId": "SEU_KEY_ID", "apiToken": "SEU_TOKEN" }
```

No Linux, rode `chmod 600 ~/.config/SafeZone/turn.json`. No Windows, mantenha a pasta de perfil do usuário com as permissões padrão do Windows.

## Privacidade

O SafeZone não tem telemetria. O apelido e a qualidade preferida ficam no armazenamento local do perfil Electron; o apelido é compartilhado com a sala enquanto você está conectado. Mensagens de texto passam pelo computador que criou a sala e ficam em memória até ela fechar. Voz, vídeo e áudio usam WebRTC com criptografia em trânsito; a voz é enviada às pessoas no canal de voz. Se TURN estiver configurado, a mídia pode passar pelo relay. O PeerJS (`0.peerjs.com`) é usado para sinalização; STUN públicos podem observar endereços IP. O código da sala é a única barreira de entrada: quem souber o código pode tentar entrar. Veja [SECURITY.md](SECURITY.md) para o modelo de ameaça e instruções para apagar as configurações locais.

## Limitações conhecidas

- A criptografia é a do WebRTC (DTLS-SRTP), mas **não há autenticação de usuários**: quem tem o código entra. Troque o código criando outra sala.
- Os pacotes ainda não são assinados. Confira o `.sha256`; ele detecta alteração acidental, mas não comprova sozinho quem publicou o arquivo.
- Sem atualização automática: atualize o Electron e o PeerJS (veja `SECURITY.md`).
