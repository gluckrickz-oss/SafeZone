# Segurança

## Como reportar

Abra um aviso privado de vulnerabilidade no repositório (GitHub: Security > Report a vulnerability) ou escreva para o mantenedor. Não publique detalhes antes de uma correção.

## Versões com correção

Só a versão mais recente recebe correções de segurança.

## Manter sem CVEs

O SafeZone é de propósito pequeno: só `electron` e `peerjs` (ambos em devDependencies, com versão exata).

1. `npm ci && npm run audit` antes de cada release.
2. `.github/dependabot.yml` já abre PRs semanais de atualização.
3. Atualize o Electron com frequência: ele embute o Chromium, que é a parte que mais recebe CVEs.
4. `npm run sbom` gera o SBOM CycloneDX para anexar à release.

## Modelo de ameaça (resumo)

- **Atacante na rede/sala:** pode mandar mensagens malformadas. O dono valida formato, tamanho e taxa, limita a 12 pessoas e ignora mensagens de quem não se apresentou.
- **Página comprometida (XSS):** CSP restrita, `sandbox`, `contextIsolation`, sem `nodeIntegration`; o IPC valida o remetente e todos os argumentos.
- **Segredos:** nenhum vai dentro do pacote. O token TURN fica no perfil do usuário com permissão 600.
- **Fora do escopo:** quem já tem acesso à sua conta de usuário no Linux.
