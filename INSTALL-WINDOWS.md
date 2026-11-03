# SafeZone para Windows

## Requisitos

- Windows 10 ou 11, 64 bits.
- Conexão com a internet para entrar ou criar uma sala.

## Baixar e abrir

1. Baixe `safezone-1.3.4-windows-x64-setup.exe` na página [Releases do SafeZone](https://github.com/gluckrickz-oss/SafeZone/releases/latest).
2. Confira o checksum SHA-256 publicado junto ao instalador.
3. Execute o instalador. Ele instala só para o seu usuário, sem privilégios de administrador.

A versão ainda não é assinada; o Windows pode exibir um aviso do SmartScreen. O checksum detecta alterações acidentais, mas não substitui uma assinatura digital. O ZIP portátil também está disponível para quem preferir não instalar.

## Áudio e compartilhamento

O Windows permite capturar o áudio de saída do sistema inteiro. Isso inclui outros aplicativos, como chamadas, sons de notificação e a reprodução do próprio PC. Na janela de compartilhamento, escolha **Sem som** se não quiser enviar áudio. Para evitar que vozes ou notificações entrem na transmissão, silencie ou feche os outros aplicativos antes de compartilhar.

Ao contrário da versão Linux, o Windows não oferece a escolha de capturar somente o áudio de um programa nesta versão.

Na tela inicial, **Configurar áudio** permite selecionar o microfone e a saída de áudio. O SafeZone usa os dispositivos reconhecidos pelo Windows; não instala drivers de hardware.

Para conversar por voz, entre no canal `voz-geral` e permita o acesso ao microfone. O canal de voz está disponível no Windows e no Linux.

## Atualizações e remoção

Use **Verificar atualizações no GitHub** dentro do app. No Windows, o botão **Atualizar agora** baixa e verifica o instalador e abre o assistente para substituir a versão instalada. Também é possível baixar uma versão manualmente pela página Releases e executar o instalador. Para desinstalar, use **Aplicativos instalados** do Windows. Para remover preferências e credenciais TURN, apague também `%APPDATA%\SafeZone`.
