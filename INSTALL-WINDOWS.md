# SafeZone para Windows

## Requisitos

- Windows 10 ou 11, 64 bits.
- Conexão com a internet para entrar ou criar uma sala.

## Baixar e abrir

1. Baixe `safezone-1.1.0-windows-x64.zip` na página [Releases do SafeZone](https://github.com/gluckrickz-oss/SafeZone/releases/latest).
2. Extraia o ZIP para uma pasta de sua preferência.
3. Abra `SafeZone.exe`.

O pacote é portátil: não precisa de instalador nem de privilégios de administrador. A versão ainda não é assinada; o Windows pode exibir um aviso do SmartScreen. Confira o SHA-256 publicado junto ao ZIP antes de executar. O checksum detecta alterações acidentais, mas não substitui uma assinatura digital.

## Áudio e compartilhamento

O Windows permite capturar o áudio de saída do sistema inteiro. Isso inclui outros aplicativos, como chamadas, sons de notificação e a reprodução do próprio PC. Na janela de compartilhamento, escolha **Sem som** se não quiser enviar áudio. Para evitar que vozes ou notificações entrem na transmissão, silencie ou feche os outros aplicativos antes de compartilhar.

Ao contrário da versão Linux, o Windows não oferece a escolha de capturar somente o áudio de um programa nesta versão.

## Atualizações e remoção

Baixe cada versão nova pela página Releases e substitua a pasta extraída. Para desinstalar, feche o app e apague a pasta do SafeZone. Para remover preferências e credenciais TURN, apague também `%APPDATA%\SafeZone`.
