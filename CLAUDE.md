# CLAUDE.md — SafeZone

SafeZone é a versão Linux e Windows do Isekai: salas para assistir filme/série juntos, com compartilhamento de tela e áudio.
Stack: Electron + WebRTC (PeerJS). Objetivo central: **mínimo de CVEs e superfície de ataque pequena**.

## Comandos

```bash
npm ci                  # instala (use npm install só para gerar/atualizar o package-lock.json)
npm test                # testes do parser de áudio (node --test, sem dependências)
npm run audit           # npm audit; deve ficar limpo antes de qualquer release
npm start               # roda o app (exige sandbox do Chromium configurado)
npm run start:dev       # sem sandbox: SÓ para desenvolvimento
npm run package:linux   # gera build/safezone-<versão>-linux-x64.tar.gz + .sha256
npm run package:windows # gera build/safezone-<versão>-windows-x64/ (rode em Windows x64)
npm run sbom            # gera build/sbom.cdx.json
```

## Estrutura

- `main.js`: processo principal (janela, sessão, IPC, captura de som).
- `preload.js`: ponte mínima `window.safezone` (contextBridge).
- `lib/pulse.js`: parser puro do `pactl` (testável). Testes em `test/`.
- `src/`: interface (`index.html`, `app.js`, `audio-worklet.js`, `style.css`). `src/vendor/` é gerado por `npm run vendor` e não vai para o git.
- `scripts/`: empacotamento, instalador, launcher, SBOM.

## Regras que NÃO podem ser quebradas

1. **Dependências:** só `electron` e `peerjs`, ambos em `devDependencies`, com versão EXATA (sem `^` ou `~`). Não adicionar `electron-builder` nem outras bibliotecas sem necessidade real: foi ele que trouxe o CVE do `minimatch`. Antes de adicionar qualquer pacote, justifique e rode `npm run audit`.
2. **Sandbox do Electron sempre ligado:** manter `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` e `app.enableSandbox()`. Nunca usar `--no-sandbox` em produção.
3. **CSP em `src/index.html`:** não afrouxar. Sem `unsafe-inline`, sem `unsafe-eval`, sem scripts/estilos inline, sem hosts novos. A única rede permitida é `0.peerjs.com` (veja também o filtro `webRequest` em `main.js`).
4. **IPC:** todo `ipcMain.handle` passa por `handle()` (confere que o remetente é a página do app) e valida cada argumento com regex/tipo. Novo canal = nova validação + novo método no `preload.js`.
5. **Sem shell:** processos externos só com `execFile`/`spawn` e lista de argumentos. Nunca `exec`, nunca `shell: true`, nunca montar comando por concatenação.
6. **Sem segredos no repositório nem no pacote:** o token TURN fica só no perfil local do usuário (`~/.config/SafeZone/turn.json` no Linux; `%APPDATA%\\SafeZone\\turn.json` no Windows). No Linux, exigir modo 600. `turn.json`, `.env*`, `*.pem`, `*.key` estão no `.gitignore`: não tirar.
7. **Rede da sala é não confiável:** toda mensagem recebida passa por `isMsg`, validação de tipo/tamanho e `rateGuard`. Só o dono da sala valida e retransmite. Manter o limite `MAX_MEMBERS` e o código de sala de 8 caracteres.
8. **Sem telemetria**, sem recursos remotos (fontes, imagens, scripts de CDN). Tudo local.
9. **Nada de `innerHTML` com dados externos:** usar `textContent`/`createElement`.

## Convenções

- Idioma da interface e dos comentários: português do Brasil.
- JavaScript CommonJS (`'use strict'`), sem bundler, sem transpilação.
- Alterou `lib/pulse.js`? Atualize/crie testes em `test/`.
- Mudança que afeta segurança ou empacotamento: atualizar `CHANGELOG.md` e, se for o caso, `SECURITY.md` e `README.md`.
- Versão em `package.json` segue SemVer; o nome do pacote sai dela.

## Áudio por programa (Linux)

`pactl list sink-inputs` lista os programas tocando; `parec --monitor-stream=N --device=<monitor do sink>` grava só aquele stream (PCM s16le, 48 kHz, estéreo). O PCM vai para o AudioWorklet e vira a faixa de áudio da chamada WebRTC. Os IDs vêm do renderer como string de dígitos e são re-resolvidos no main antes de rodar `parec`: nunca confiar em nome de dispositivo vindo do renderer.

## Antes de abrir um PR / release

1. `npm test` e `npm run audit` limpos.
2. `node --check` nos arquivos JS alterados.
3. Testar manualmente: criar sala, entrar com 2º perfil (`SAFEZONE_PROFILE=b npm start`), compartilhar uma janela e assistir. No Linux, conferir o áudio do programa escolhido; no Windows, conferir áudio do sistema e a opção sem áudio.
4. `npm run package:linux` no Linux; `npm run package:windows` no Windows x64. Conferir checksum e SBOM antes da publicação.

## Áudio do sistema (Windows)

O Electron usa o loopback de áudio do Windows. Ele captura o som de saída do sistema inteiro, não um programa específico; chamadas e notificações também podem entrar na transmissão. A interface deve permitir enviar o áudio do sistema ou nenhum áudio, e explicar essa diferença antes de compartilhar.

## Limitações conhecidas (não "consertar" sem discutir)

- Sem autenticação: quem tem o código da sala entra.
- Pacote sem assinatura (assinar com cosign/gpg ao publicar).
- Netflix/Prime/Disney+ aparecem pretos (DRM): é esperado.
