# Segurança e privacidade

Este documento descreve os controles e limites atuais do SafeZone. Não representa certificação nem declaração de conformidade regulatória.

## Reportar uma vulnerabilidade

Use **Report a vulnerability** na aba Security do repositório para enviar um aviso privado. Inclua a versão, o sistema afetado, os passos para reproduzir e o impacto observado. Não publique detalhes exploráveis antes de uma correção estar disponível. Se o recurso de aviso privado não estiver habilitado, contate o mantenedor pelo perfil do GitHub.

O mantenedor avalia o impacto, prepara uma correção, publica uma versão atualizada e informa as pessoas afetadas. A versão mais recente é a única linha de lançamento mantida atualmente; não há prazo de suporte ou atualização automática definido.

## Modelo de ameaça

### O que protegemos

- O acesso ao processo principal do Electron, à janela local e ao token TURN configurado pelo usuário.
- A integridade básica das mensagens de sala, para reduzir abuso por participantes conectados.
- O áudio local: no Linux, o transmissor escolhe um programa; no Windows, escolhe áudio do sistema ou nenhum áudio.

### Controles implementados

- Electron com `sandbox`, `contextIsolation`, `webSecurity` ativos e `nodeIntegration` desativado.
- CSP local restrita; a página aceita conexão de sinalização apenas com `0.peerjs.com`.
- IPC limitado à página local e com validação de argumentos; processos externos são iniciados sem shell.
- Mensagens de sala validadas, com limite de tamanho, limite de frequência e até 12 participantes.
- Credenciais TURN opcionais ficam em `~/.config/SafeZone/turn.json` no Linux ou `%APPDATA%\SafeZone\turn.json` no Windows. No Linux, arquivos com permissões mais abertas que `600` são ignorados.
- Dependências declaradas com versões exatas, lockfile versionado, auditoria de dependências e varredura de segredos na automação do GitHub.

### Limites conhecidos

- Não há autenticação de contas. Quem obtiver o código de oito caracteres pode tentar entrar na sala.
- O dono da sala coordena a lista de participantes; não há moderação, bloqueio individual ou confirmação de identidade.
- WebRTC cifra mídia em trânsito, mas o SafeZone não oferece criptografia de ponta a ponta com identidade verificada. A sinalização usa o serviço PeerJS; STUN públicos podem observar endereços IP. Se TURN estiver configurado, o tráfego pode passar por esse relay.
- Conteúdo protegido por DRM pode aparecer preto durante a captura de tela.
- Não há atualizador automático. O usuário precisa obter as versões por um canal confiável e instalar cada atualização manualmente.

## Dados e armazenamento

- O SafeZone não tem telemetria nem conta de usuário.
- O nome e a qualidade preferida ficam no armazenamento local do perfil Electron; o nome também é transmitido aos membros da sala enquanto a sessão está ativa.
- O código da sala, estado de transmissão, lista de participantes e mídia existem durante a sessão. O servidor PeerJS é usado para sinalização e os peers negociam a conexão WebRTC.
- O token TURN é opcional e fica no arquivo local indicado acima. No Windows, ele fica no perfil do usuário, protegido pelas permissões da pasta de perfil. Não o inclua em issues, logs ou commits.
- Para remover preferências e o token TURN, feche o SafeZone e apague `~/.config/SafeZone` no Linux ou `%APPDATA%\SafeZone` no Windows. Isso encerra a configuração local e exige recriar o token TURN se você voltar a usá-lo.

## Atualizações e verificação

1. Acompanhe as versões e avisos no repositório oficial.
2. Antes de instalar um pacote, compare o checksum SHA-256 publicado com o arquivo recebido. O checksum ajuda a detectar corrupção; sozinho, não comprova quem publicou o arquivo.
3. Prefira pacotes e instruções publicados pelo mantenedor. Não execute um pacote recebido por mensagem privada sem verificar sua origem.
4. Para desenvolvimento, use `npm ci` para instalar exatamente o conteúdo do `package-lock.json`, depois `npm run audit`.
5. Alterações no repositório passam por GitHub Actions: verificação de dependências, sintaxe JavaScript e varredura de segredos.

O projeto ainda não publica artefatos assinados. Até que assinatura seja configurada, o checksum não substitui uma assinatura criptográfica autenticada.

## Dependências e SBOM

O conjunto de dependências diretas é intencionalmente pequeno (`electron` e `peerjs`). Dependabot verifica atualizações semanalmente. Antes de preparar uma versão, rode `npm ci`, `npm run audit`, `npm test` e `npm run sbom`; revise os resultados e anexe `build/sbom.cdx.json` à publicação.
