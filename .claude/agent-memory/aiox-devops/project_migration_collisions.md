---
name: drizzle-migration-collisions
description: Branches paralelas geram migrations drizzle com mesmo indice e nomes diferentes — como detectar duplicata real antes de apagar branch
metadata:
  type: project
---

# Colisão de numeração de migrations entre branches

Duas branches que rodam `drizzle-kit generate` para o **mesmo drift de schema**
produzem arquivos com o **mesmo índice e nomes aleatórios diferentes** — ex.:
`drizzle/0031_lovely_the_executioner.sql` e `drizzle/0031_eager_captain_stacy.sql`,
ambos com o mesmo conteúdo (`emailImapHost`/`emailImapPort` em `channelSettings`).
Se as duas forem mergeadas, o repo fica com dois `0031` e o journal quebra.

**Why:** o nome do arquivo vem de um gerador aleatório do drizzle-kit, não do
conteúdo. Então duplicata semântica **não** aparece como conflito de git — os
arquivos têm nomes distintos e o merge passa limpo. Aconteceu em 2026-08-27 entre
`seguranca/webhook-hmac` e `feat/integracao-sara` (PR #12).

**How to apply:** antes de apagar uma branch que parece redundante, não confie na
lista de commits — compare **conteúdo**:

```
git diff <branch-suspeita> <branch-atual> -- <arquivo>   # vazio = idêntico
git show <branch>:drizzle/00NN_*.sql                     # compara corpo do SQL
```

Um `git log A..B` que mostra commit "único" pode ser só o mesmo fix reaplicado
com outro hash. Foi o caso: o commit existia só na branch órfã, mas `0001` era
byte-idêntico e o `0031` tinha conteúdo idêntico sob outro nome — zero trabalho
perdido ao apagar. Cheque também `gh pr list --state all --head <branch>`: se o
PR daquela branch já está MERGED, a branch foi reutilizada pós-merge (padrão
recorrente aqui, ver [[ominichat-pr-branch-flow]]).

Prevenção: evitar gerar migration em duas branches ao mesmo tempo; se acontecer,
descartar uma e regerar a partir do `main` atualizado.
