---
name: devops-gates-environment
description: Pre-push gates available in Ominichat 2.0 and which AIOX/CodeRabbit tooling is absent in this repo
metadata:
  type: project
---

# Gates e tooling de DevOps neste repo

Os gates de pre-push que realmente existem aqui são `pnpm check` (tsc --noEmit),
`pnpm test` (vitest) e `pnpm build`. **Não há script de lint** — não perca tempo
procurando `pnpm lint`.

Duas ferramentas que a configuração global do AIOX assume, mas que **não existem
neste repositório/ambiente**:

- **Diretórios do framework AIOX** (`.aiox-core/`, `.aiox/`, `.claude/commands/`)
  não existem. Só há `.claude/agent-memory/` e `.claude/worktrees/`. Tentar ler
  `.claude/commands/AIOX/agents/devops.md`, `.aiox-core/development/tasks/*` ou
  `.aiox/gotchas.json` falha. Execute a missão diretamente.
- **CodeRabbit CLI** não está acessível: `wsl bash -c ...` retorna
  `/bin/sh: bash: not found`. O gate de CodeRabbit deve ser pulado e registrado
  como decisão, não tentado repetidamente.

**Why:** verificado em 2026-08-27 durante o PR #11. As instruções globais do
AIOX descrevem uma estrutura que este projeto não adotou, então seguir o roteiro
padrão gera uma sequência de leituras que falham antes de qualquer trabalho útil.

**How to apply:** em qualquer missão de push/PR aqui, vá direto para
`git status` → diff review → `pnpm check` + `pnpm test` + `pnpm build` → push →
`gh pr create`. Ver também [[ominichat-pr-branch-flow]].
