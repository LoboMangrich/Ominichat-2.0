# Ominichat 2.0 — contexto do projeto

Plataforma omnichannel de atendimento, **ferramenta interna do time de Customer
Success da empresa**. Não é produto SaaS e não será vendido a terceiros — ver
"Decisões de escopo", porque isso muda o que NÃO deve ser construído.

Canais previstos: WhatsApp (Cloud API), Instagram/Messenger, Telegram e e-mail
(IMAP), além de webhooks de Digital Manager Guru, GoHighLevel, Pagar.me, Z-API e
Evolution API.

Este arquivo é o contexto permanente do repositório. Leia antes de editar.

## Estado real do projeto — leia primeiro

O projeto foi gerado na plataforma Manus e **nunca rodou fora dela**. Ninguém do
time viu a aplicação funcionando localmente. Nenhuma conta foi criada no Meta for
Developers, o que significa que **as integrações de WhatsApp e Instagram nunca
receberam uma mensagem real** — o código existe e compila, mas nunca foi
exercitado contra a API de verdade.

Consequências práticas:

- Não trate nenhum módulo como "funcionando" sem verificação. Com ~42.800 linhas
  e 2 arquivos de teste, a distância entre "o código existe" e "o código
  funciona" é desconhecida e provavelmente grande.
- Não há deploy em produção. Nenhuma URL pública recebe webhooks hoje.
- O objetivo imediato não é adicionar features, é **fazer o projeto rodar de
  forma independente do Manus**.

## Stack

- **Backend:** Node.js + TypeScript, Express, tRPC v11
- **Banco:** MySQL via Drizzle ORM (`dialect: "mysql"` — NÃO é Postgres)
- **Frontend:** React 19, Vite 7, Tailwind 4, Radix UI, wouter, TanStack Query
- **Validação:** Zod v4
- **Gerenciador de pacotes:** pnpm (obrigatório — ver "Armadilhas")

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
                      ATENÇÃO: acoplado à plataforma Manus (ver prioridade 2)
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

## Decisões de escopo — o que NÃO construir

Por ser ferramenta interna de um único time, estas coisas foram deliberadamente
descartadas. Não reintroduza sem conversa explícita:

- **Multi-tenancy.** Nada de `tenantId`/`organizationId` no schema. Um único time
  usa o sistema. Isolamento multi-tenant aqui é complexidade paga sem retorno:
  coluna extra em toda tabela, filtro em toda query, mais superfície de bug.
- **Escala horizontal, CDN, otimização para picos.** O volume é de dezenas de
  atendentes, não de milhares de usuários anônimos.
- **Onboarding self-service, billing, planos.** Não há clientes externos.

Na dúvida entre a solução simples e a "escalável", escolha a simples.

## Convenções

- Comentários e mensagens de erro voltadas ao usuário em **português**
- Nomes de código (variáveis, funções, tabelas) em **inglês**
- Rotas HTTP fora do tRPC **precisam** começar com `/api/` para serem roteadas
- `registerWebhooks(app)` é montado **antes** do tRPC, então a proteção padrão do
  tRPC não se aplica a nada em `webhooks.ts` — use os middlewares de
  `server/_core/routeGuards.ts` (`requireSession`, `requireCronAuth`)
- Middlewares de auth novos devem ser **fail-closed**: sem o segredo configurado,
  a rota nega. Nunca abre.
- Comparação de segredos sempre com `timingSafeEqual` e checagem de tamanho antes
  (padrão em `routeGuards.ts:38`)
- Credenciais de canal ficam na tabela `channelSettings` no banco, configuradas
  pela interface — **não** em variável de ambiente. Siga esse padrão ao adicionar
  credenciais novas (ex.: `waAppSecret`, `igAppSecret`).

## Prioridades atuais (em ordem)

### 1. Fazer o projeto subir localmente

Hoje toda variável em `server/_core/env.ts` tem fallback para string vazia, então
a aplicação **sobe sem reclamar e falha silenciosamente depois**.

- `.env.example` documentando cada variável, separando obrigatórias de opcionais
- `assertRequiredEnv()` exigindo `DATABASE_URL` e `JWT_SECRET`, chamado dentro de
  `startServer()` em `index.ts` — **não** no topo de `env.ts`, porque os testes
  importam `routers.ts`, que carrega `env.ts` transitivamente, e a validação no
  topo do módulo quebraria `pnpm test`
- `JWT_SECRET` precisa validar **conteúdo**, não só presença: mínimo de 32
  caracteres e rejeição de placeholders (`changeme`, `secret`, `test`). Chave de
  assinatura fraca ou vazia permite forjar cookie de sessão de Admin — é o risco
  de segurança mais grave do projeto hoje.
- MySQL local rodando e migrations aplicadas

### 2. Autenticação própria, independente do Manus

É o passo que destrava tudo. Hoje o login passa por `OAUTH_SERVER_URL` e
`OWNER_OPEN_ID`, apontando para a infraestrutura do Manus, à qual o time não tem
acesso.

Superfície de acoplamento (medida — contida, não espalhada pelo projeto):

| Arquivo | Linhas |
|---|---|
| `server/_core/sdk.ts` | 304 |
| `server/_core/llm.ts` | 332 |
| `server/_core/voiceTranscription.ts` | 284 |
| `server/_core/imageGeneration.ts` | 92 |
| `server/_core/types/manusTypes.ts` | 69 |
| `server/_core/oauth.ts` | 53 |

Apenas 15 arquivos importam esses módulos, e 10 são o próprio `_core`. Fora de
`_core`: `storage.ts`, `routers.ts`, `communicationIntelligence.ts`,
`webhooks.ts` e `client/src/components/Map.tsx`.

Como a ferramenta é interna, **preferir login corporativo (Google Workspace /
OIDC da empresa) a construir sessão própria do zero.** Menos código, menos
superfície de erro, e o time já tem as contas. `jose` já está instalado.

### 3. Inventário do que realmente funciona

Antes de refatorar qualquer motor de domínio, verificar se funciona. Escrever
teste ao encontrar comportamento real. Priorizar: `conversationRouter`,
`automationEngine`, `playbookEngine`, `channelSender`.

### 4. LLM direto no provedor

`llm.ts`, `imageGeneration.ts` e `voiceTranscription.ts` chamam a Forge API do
Manus. Trocar por chamada direta ao provedor escolhido, com a chave em variável
de ambiente.

### 5. Validação de assinatura nos webhooks — antes de qualquer deploy

Nenhum dos 15 endpoints POST em `server/webhooks.ts` valida assinatura. Não há
`createHmac` no server. O que existe é apenas `hub.verify_token`, que cobre só o
handshake GET da Meta — os POSTs, onde as mensagens chegam, ficam abertos.

Não é urgente hoje porque não há deploy, mas é **bloqueante para ir ao ar**.

- `server/_core/webhookAuth.ts` com verificação por provedor:
  - Meta (WhatsApp, Instagram): HMAC-SHA256 do **corpo bruto** contra o header
    `x-hub-signature-256`, usando o App Secret do app
  - Telegram: header `x-telegram-bot-api-secret-token`
  - Pagar.me, Guru, GHL, Z-API, Evolution: conferir o mecanismo de cada provedor
- Express precisa preservar o **raw body**. `express.json()` descarta o buffer
  original; use a opção `verify` para guardar `req.rawBody`. HMAC calculado sobre
  JSON re-serializado **não confere**.
- Remover o fallback hardcoded em `webhooks.ts:641`
  (`WHATSAPP_VERIFY_TOKEN || "cs_platform_verify_token"`). Fail-closed.
- Schemas Zod para cada payload. Hoje os handlers leem `req.body` direto e gravam
  no banco.
- O App Secret exige um app no Meta for Developers, que ainda não existe. **A
  validação pode e deve ser implementada e testada sem credencial real** — o
  teste gera um secret fake, assina o payload e verifica aceite e rejeição.

### 6. Modularizar `server/routers.ts`

5.482 linhas num arquivo. Quebrar em `server/routers/<domínio>.ts` e compor no
root router. Fatias pequenas, uma por commit, sem alterar assinatura de
procedure — o client depende dos tipos inferidos.

## LGPD e dados pessoais

O sistema processa conversas reais com clientes: nome, telefone, e-mail,
histórico de atendimento. Isso é dado pessoal sob a LGPD **mesmo sendo ferramenta
interna**. Uso interno reduz a superfície de exposição, não a obrigação legal.

- **Os logs vazam dados pessoais hoje.** `server/webhooks.ts` tem 35
  `console.log`, vários imprimindo e-mail e nome de cliente (ex.: linhas 267,
  323, 399, 418). Em produção, remover ou mascarar.
- Nunca logar telefone, e-mail, documento ou conteúdo de mensagem em produção.
  Não logar payload completo de webhook.
- Ao adicionar log novo, registrar identificador interno (`customerId`), não o
  dado pessoal.
- Definir política de retenção de conversas antes do go-live.

## Armadilhas conhecidas

- **`npm install` falha.** `@builder.io/vite-plugin-jsx-loc@0.1.1` declara peer
  `vite@^4 || ^5`, o projeto usa vite 7. Só resolve com pnpm.
- `wouter@3.7.1` tem patch em `patches/`. Ao subir versão, revalidar o patch.
- 31 migrations em `drizzle/`. Não editar migration aplicada — gerar nova.
- `getDb()` retorna `null` quando falta `DATABASE_URL` (lazy, intencional para
  tooling local). Todo código que usa o banco precisa lidar com isso, senão falha
  de forma confusa em vez de dizer o que está errado.
- 330 usos de `any`, concentrados nos pontos de integração — exatamente onde a
  tipagem mais importa.

## Segurança — regras invioláveis

- Segredos apenas por variável de ambiente ou `channelSettings`. Nunca no
  repositório, nunca como fallback literal. **O repositório é público hoje** —
  considerar torná-lo privado antes de existir dado real.
- Todo endpoint novo fora do tRPC nasce com guard explícito.
- Validar entrada externa com Zod antes de tocar no banco.
- `.env.example` nunca contém valor real, só descrição e formato.
