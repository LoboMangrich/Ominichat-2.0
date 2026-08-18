# Ominichat 2.0 — contexto do projeto

Plataforma omnichannel de atendimento e customer success. Canais em uso: WhatsApp
(Cloud API), Instagram/Messenger, Telegram e e-mail (IMAP), além de webhooks de
Digital Manager Guru, GoHighLevel, Pagar.me, Z-API e Evolution API.

Este arquivo é o contexto permanente do repositório. Leia antes de editar.

## Stack

- **Backend:** Node.js + TypeScript, Express, tRPC v11
- **Banco:** MySQL via Drizzle ORM (`dialect: "mysql"` — NÃO é Postgres)
- **Frontend:** React 19, Vite 7, Tailwind 4, Radix UI, wouter, TanStack Query
- **Validação:** Zod v4
- **Gerenciador de pacotes:** pnpm (obrigatório — ver "Armadilhas" abaixo)

## Comandos

```bash
pnpm install          # npm install QUEBRA — use pnpm
pnpm dev              # dev server (tsx watch server/_core/index.ts)
pnpm check            # tsc --noEmit
pnpm test             # vitest run
pnpm db:push          # drizzle-kit generate && migrate
pnpm format           # prettier
```

## Mapa do repositório

```
server/_core/         Infraestrutura: env, trpc, contexto, auth, guards, LLM, storage
                      ATENÇÃO: acoplado à plataforma Manus (ver "Dívida" abaixo)
server/routers.ts     5.482 linhas, ~402 procedures tRPC. Precisa ser modularizado.
server/webhooks.ts    1.417 linhas, 15 endpoints HTTP fora do tRPC
server/*.ts           Motores de domínio: automation, playbook, healthScore,
                      conversationRouter, channelSender, channelHealth,
                      communicationIntelligence, csvImport, conversationBackup
shared/               Tipos e constantes compartilhados client/server
drizzle/schema.ts     1.127 linhas. 31 migrations aplicadas.
client/src/pages/     Telas (algumas com 1.000–1.700 linhas)
client/src/components/ui/  Componentes Radix/shadcn
```

## Convenções

- Comentários e mensagens de erro voltadas ao usuário em **português**
- Nomes de código (variáveis, funções, tabelas) em **inglês**
- Rotas HTTP fora do tRPC **precisam** começar com `/api/` para serem roteadas
- `registerWebhooks(app)` é montado **antes** do tRPC, então a proteção padrão do
  tRPC não se aplica a nada em `webhooks.ts` — use os middlewares de
  `server/_core/routeGuards.ts` (`requireSession`, `requireCronAuth`)
- Middlewares de auth novos devem ser **fail-closed**: se o segredo não estiver
  configurado, a rota nega. Nunca abre.
- Comparação de segredos sempre com `timingSafeEqual` e checagem de tamanho antes
  (padrão em `routeGuards.ts:38`)

## Prioridades atuais (em ordem)

### 1. Validação de assinatura nos webhooks — CRÍTICO, fazer primeiro

Nenhum dos 15 endpoints POST em `server/webhooks.ts` valida assinatura. Não há
`createHmac` no server. O que existe é apenas `hub.verify_token`, que cobre só o
handshake GET da Meta — os POSTs, onde as mensagens realmente chegam, estão
abertos para qualquer requisição anônima da internet.

Riscos concretos: injeção de mensagens falsas, criação de contatos, disparo de
automações e consumo de créditos de LLM por terceiros.

A fazer:
- `server/_core/webhookAuth.ts` com verificação por provedor:
  - Meta (WhatsApp, Instagram): HMAC-SHA256 do **corpo bruto** contra o header
    `x-hub-signature-256`, usando o App Secret
  - Telegram: header `x-telegram-bot-api-secret-token`
  - Pagar.me, Guru, GHL, Z-API, Evolution: conferir o mecanismo de cada um na
    documentação do provedor antes de implementar
- Express precisa preservar o **raw body** para o HMAC. `express.json()` descarta
  o buffer original; use a opção `verify` para guardar `req.rawBody`. Assinatura
  calculada sobre JSON re-serializado **não confere**.
- Remover o fallback hardcoded em `webhooks.ts:641`
  (`WHATSAPP_VERIFY_TOKEN || "cs_platform_verify_token"`). O repositório é
  público — esse token não é secreto. Fail-closed.
- Schemas Zod para cada payload de webhook. Hoje os handlers leem `req.body`
  direto e gravam no banco.

### 2. Modularizar `server/routers.ts`

5.482 linhas num arquivo. Quebrar em `server/routers/<domínio>.ts` e compor no
root router. Mover em fatias pequenas, uma por commit, sem alterar a assinatura
das procedures — o client depende dos tipos inferidos.

### 3. Isolamento multi-tenant

`drizzle/schema.ts` não tem `tenantId`, `organizationId` nem `companyId` em
nenhuma tabela. Se a plataforma vai atender mais de um cliente, adicionar agora
é barato; depois de dados em produção é uma migração dolorosa. Decidir antes de
crescer o schema.

### 4. Reduzir acoplamento com a plataforma Manus

O projeto nasceu no Manus e ainda depende dele em runtime:
- `server/_core/sdk.ts` e `oauth.ts` — autenticação passa pelo OAuth server do
  Manus (`OAUTH_SERVER_URL`, `OWNER_OPEN_ID`)
- `server/_core/llm.ts`, `imageGeneration.ts`, `voiceTranscription.ts` — chamadas
  de IA vão pela Forge API (`BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`)
- `server/_core/types/manusTypes.ts`, `vite-plugin-manus-runtime`

Enquanto isso existir, não há deploy independente. Substituir por auth própria
(sessão + JWT com `jose`, já instalado) e chamadas diretas ao provedor de LLM.

### 5. Qualidade geral

- 330 usos de `any` em `server/`, `client/src` e `shared/` — concentrados nos
  pontos de integração, que é exatamente onde a tipagem importa
- 2 arquivos de teste (`server/auth.logout.test.ts`, `server/platform.test.ts`)
  para ~42.800 linhas. Priorizar testes nos motores de domínio e na validação de
  webhook antes de refatorar qualquer um deles.

## Armadilhas conhecidas

- **`npm install` falha.** `@builder.io/vite-plugin-jsx-loc@0.1.1` declara peer
  `vite@^4 || ^5`, o projeto usa vite 7. Só resolve com pnpm. Se for remover o
  plugin, confirmar que nada depende dele antes.
- `wouter@3.7.1` tem patch aplicado em `patches/`. Ao subir a versão, revalidar o
  patch.
- Migrations: 31 arquivos em `drizzle/`. Não editar migration já aplicada — gerar
  nova.

## Segurança — regras invioláveis

- Segredos apenas por variável de ambiente. Nunca no repositório, nunca como
  fallback literal no código. O repositório é público.
- Todo endpoint novo fora do tRPC nasce com um guard explícito.
- Validar entrada externa com Zod antes de tocar no banco.
- Não logar payload completo de webhook nem dados pessoais de contato em
  produção (há vários `console.log` com telefone e nome hoje).
