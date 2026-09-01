---
name: ominichat-pr-branch-flow
description: Como PRs funcionam no Ominichat 2.0 — branches reutilizadas apos merge e deps de env do modulo Sara IA
metadata:
  type: project
---

# Fluxo de PR e pendências de go-live

**Branches são reutilizadas depois do merge, e isso suja o diff do PR.** O GitHub
apaga a branch remota ao mergear, mas a branch local continua e recebe commits
novos (ex.: `feat/rebrand-cashmiles` teve o PR #10 merged e depois mais 3
commits). Consequências práticas:

- `git push origin <branch>` reporta `* [new branch]` mesmo em branch antiga, e
  **é preciso abrir um PR novo** — o anterior está fechado e não recebe commits.
- Se o `main` avançar enquanto o PR está aberto, o diff do PR passa a misturar
  os commits novos com os do PR já mergeado. **A correção é recriar a branch a
  partir do `main` atualizado e reaplicar os commits por cherry-pick**, fechar o
  PR antigo com um comentário apontando o substituto, e abrir um PR novo. Foi o
  que aconteceu com o PR #11 → #12 (branch `feat/integracao-sara`), em
  2026-08-27. O cherry-pick foi limpo; para confirmar equivalência, comparar
  `git diff <base_antiga>..<head_antigo>` com `git diff <base_nova>..<head_novo>`
  — a diferença deve ser só o conteúdo que o `main` absorveu no meio.

**Prefira branch nova a branch reutilizada** ao começar trabalho novo aqui.

**Módulo Sara IA depende de env não configurada em produção.** A tela `/sara`
(integração com a Sara Support API, sistema externo do Epic 71) exige
`SARA_SUPPORT_API_URL` e `SARA_SUPPORT_API_KEY`. Sem elas a tela carrega e falha
com erro explícito ao listar/enviar; nenhum outro módulo é afetado. O valor real
vive só no `.env` local (gitignored) — `.env.example` tem os campos vazios.
Módulo entregue pelo PR #12.

**Why:** o projeto ainda não tem deploy (ver CLAUDE.md), então toda variável nova
vira item de checklist de go-live que ninguém configurou ainda. Registrado no
PR #11 em 2026-08-27.

**How to apply:** ao preparar release ou deploy, cheque essas duas variáveis
junto com `DATABASE_URL` e `JWT_SECRET`. Ao receber um pedido de push numa branch
que "já teve PR", confirme o estado do PR anterior com `gh pr list --state all`
antes de assumir que basta empurrar. Ver [[devops-gates-environment]].
