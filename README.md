# SafeZone (Linux)

Assista filme e série com os amigos: cada um entra numa sala com um código, quem vai passar o filme compartilha a janela do player e **só o som desse programa** vai para a sala. A voz da call no Discord não vaza junto.

Esta é a versão para Linux do Isekai, com superfície de ataque reduzida e foco em ter o mínimo de CVEs.

## Requisitos

- Linux x86_64 com PulseAudio ou PipeWire (com `pipewire-pulse`)
- `pactl` e `parec` (pacote `pulseaudio-utils` no Debian/Ubuntu; `libpulse` no Arch/Fedora)
- Para compartilhar a tela no Wayland: PipeWire + `xdg-desktop-portal` do seu ambiente (GNOME, KDE...)

## Instalar (pacote pronto)

```bash
tar xzf safezone-1.0.0-linux-x64.tar.gz
cd safezone-1.0.0-linux-x64
./install.sh
safezone
```

O `install.sh` instala só para o seu usuário em `~/.local`. Ele só pede `sudo` se o seu sistema bloquear o sandbox do Chromium (caso do Ubuntu 24.04): nesse caso ajusta o `chrome-sandbox` (setuid root). O sandbox fica **ligado**. Só use `SAFEZONE_NO_SANDBOX=1 safezone` para diagnóstico.

## Rodar a partir do código

```bash
npm ci            # instala as versões exatas registradas no package-lock.json
npm test          # testes do leitor de áudio
npm start         # abre o app (precisa do chrome-sandbox configurado)
npm run start:dev # abre sem sandbox: só para desenvolvimento
npm run package:linux   # gera build/safezone-<versão>-linux-x64.tar.gz + .sha256
npm run sbom      # gera build/sbom.cdx.json (CycloneDX)
npm run audit     # npm audit
```

## Como usar

1. Coloque seu nome e clique em **Criar sala**. Clique no código no topo para copiar e mande para o pessoal.
2. Os outros colocam o código (8 letras/números) e clicam em **Entrar**.
3. Quem vai passar o filme clica em **Compartilhar tela**, escolhe a janela (no Wayland o sistema pergunta) e, embaixo, de qual programa sai o som.
4. Para assistir, clique no nome de quem está **Transmitindo**. Duplo clique no vídeo deixa em tela cheia.

A lista de programas com som mostra só quem está tocando áudio **agora**: dê play no player antes de abrir "Compartilhar tela".

### Avisos

- Netflix, Prime e Disney+ no navegador aparecem pretos (proteção contra cópia).
- A sala fica no PC de quem criou: se essa pessoa fechar o SafeZone, a sala acaba.
- A sala aceita até 12 pessoas.

## Como o som de um programa só funciona no Linux

`pactl` lista os streams de áudio (cada programa tocando é um "sink input") e `parec --monitor-stream=N` grava **somente** o stream escolhido, sem mexer nas suas saídas: você continua ouvindo normalmente e a voz do Discord não entra, a menos que você escolha o Discord. O PCM (16 bits, 48 kHz, estéreo) vai para um AudioWorklet e vira a faixa de áudio da transmissão WebRTC (Opus estéreo, 256 kbps).

## O que mudou em relação ao Isekai (segurança)

| Tema | Isekai | SafeZone |
|---|---|---|
| CVE `minimatch 3.1.5` (CVE-2026-118764) | presente (vinha do electron-builder) | removido: o empacotador não é mais dependência |
| Dependências no lockfile | 246 | só Electron e PeerJS (e as dependências deles), em devDependencies |
| Dependências dentro do app final | `node_modules/peerjs` | nenhuma: só 1 arquivo `peerjs.min.js` copiado |
| Token TURN da Cloudflare | `turn.json` empacotado dentro do .exe | nunca empacotado; fica em `~/.config/SafeZone/turn.json` (chmod 600) |
| Sandbox do Electron | não definido explicitamente | `sandbox: true` + `app.enableSandbox()` |
| CSP | nenhuma | restrita a `self` + `0.peerjs.com` |
| Rede da janela | livre | bloqueada, exceto o servidor PeerJS |
| Permissões, navegação, novas janelas | padrão | negadas (só captura de tela e tela cheia) |
| IPC | sem validação | só aceita chamadas da página do app e valida cada argumento |
| Execução de processos | `execFile`/`spawn` | idem, sempre com lista de argumentos (sem shell) e IDs validados |
| Código da sala | 6 caracteres (30 bits) | 8 caracteres (40 bits) |
| Mensagens da sala | confiadas | formato, tamanho, taxa e limite de 12 pessoas conferidos |
| Chamadas recebidas | só de quem se assiste | idem; conexões de dados em quem não é dono são recusadas |
| `.npmrc` / `.gitignore` | ausentes | registry fixo, versões exatas, `.env*` e `turn.json` ignorados |
| Fontes e imagem de fundo | pacote local de fontes | fontes do sistema (sem arquivos binários de terceiros) |

## TURN opcional

Se a internet de alguém bloqueia a conexão direta, crie `~/.config/SafeZone/turn.json`:

```json
{ "keyId": "SEU_KEY_ID", "apiToken": "SEU_TOKEN" }
```

e rode `chmod 600 ~/.config/SafeZone/turn.json`. Arquivo legível por outros usuários é ignorado.

## Privacidade

O SafeZone não tem telemetria. O nome e a qualidade preferida ficam no armazenamento local do perfil Electron; o nome é compartilhado com a sala enquanto você está conectado. O PeerJS (`0.peerjs.com`) é usado para sinalização; STUN públicos podem observar endereços IP. O vídeo e o áudio usam WebRTC com criptografia em trânsito. Se TURN estiver configurado, a mídia pode passar pelo relay. O código da sala é a única barreira de entrada: quem souber o código pode tentar entrar. Veja [SECURITY.md](SECURITY.md) para o modelo de ameaça e instruções para apagar as configurações locais.

## Limitações conhecidas

- A criptografia é a do WebRTC (DTLS-SRTP), mas **não há autenticação de usuários**: quem tem o código entra. Troque o código criando outra sala.
- O pacote não é assinado. Confira o `.sha256` e, se publicar, assine o `.tar.gz` (`cosign` ou `gpg`).
- Sem atualização automática: atualize o Electron e o PeerJS (veja `SECURITY.md`).
