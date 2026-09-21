# Cashmiles — contexto do projeto

Plataforma omnichannel de atendimento, **ferramenta interna do time de Customer
Success da empresa**. Não é produto SaaS e não será vendido a terceiros — ver
"Decisões de escopo", porque isso muda o que NÃO deve ser construído.

Canais previstos: WhatsApp (Cloud API), Instagram/Messenger, Telegram e e-mail
(IMAP), além de webhooks de Digital Manager Guru, GoHighLevel, Pagar.me, Z-API e
Evolution API.

Este arquivo é o contexto permanente do repositório. Leia antes de editar.

## Estado real do projeto

O projeto nasceu na plataforma Manus e não rodava fora dela. Hoje **roda
localmente de forma independente** — ver "Rodando localmente". O desvínculo do
Manus está quase completo: branding, URLs, coletor de debug e módulos mortos
foram removidos.

O Manus não é mais usado para autenticação. `oauth.ts`, `manusTypes.ts` e o
`OAuthService` foram removidos. O login passou por duas fases: primeiro
Google Workspace (PR #31), depois substituído por e-mail/senha próprio do
Cashmiles (decisão de produto — ver "Autenticação" abaixo). Não existe mais
nenhum provedor externo no caminho de login.

O que ainda depende do Manus:

- Restam apenas `storage.ts`, `voiceTranscription.ts`, `map.ts` e
  `notification.ts` usando a Forge API — e nenhum deles bloqueia deploy;
  falham apenas na feature específica.

Não há deploy em produção. Nenhuma URL pública recebe webhooks hoje.

**Cuidado ao assumir que algo funciona.** Vários recursos pareciam prontos e
estavam quebrados em silêncio (filtros comparando português contra enum em
inglês, tags sem seed, `isActive` sem efeito em 402 procedures). Verifique antes
de confiar.

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
pnpm dev:session      # gera JWT de Admin local
pnpm create-admin     # bootstrap do primeiro Admin (produção — ver "Autenticação")
pnpm check            # tsc --noEmit
pnpm test             # vitest run
pnpm db:push          # drizzle-kit generate && migrate
pnpm format           # prettier
```

## Mapa do repositório

```
server/_core/         Infraestrutura: env, trpc, contexto, auth, guards, LLM
server/routers.ts     ~5.500 linhas, ~402 procedures tRPC. Precisa modularização.
server/routers/       Routers já extraídos (sara.ts)
server/webhooks.ts    ~1.400 linhas, 15 endpoints HTTP fora do tRPC
server/saraSupportClient.ts  Cliente HTTP da Sara Support API
server/*.ts           Motores de domínio: automation, playbook, healthScore,
                      conversationRouter, channelSender, channelHealth,
                      communicationIntelligence, csvImport, conversationBackup
shared/               Tipos e constantes compartilhados client/server
drizzle/schema.ts     ~1.130 linhas, 55 tabelas, 33 migrations
client/src/pages/     Telas (algumas com 1.000–1.700 linhas)
client/src/lib/       Helpers compartilhados (publicUrl.ts)
```

## Autenticação

Login por e-mail/senha, gerenciado pelo próprio Cashmiles — substituiu o login
com Google Workspace (decisão de produto). Sem cadastro público e sem
"esqueci minha senha": só o Admin cria conta e redefine senha.

- **Hash:** argon2id (`server/_core/passwordHash.ts`, pacote `argon2`).
  Testado neste projeto sem atrito de build no Windows/pnpm — binário
  pré-compilado, não passa por build script.
- **Identificador de login:** `users.openId` guarda o e-mail normalizado
  (trim + lowercase) — não é mais o `sub` do Google. Reaproveitado como
  estava para não tocar em `sdk.ts`/`routeGuards.ts`.
- **Senha mínima:** `MIN_PASSWORD_LENGTH` (`shared/const.ts`) = 10
  caracteres, validado em `usersRouter.create`/`resetPassword` e
  `auth.changePassword`.
- **Troca obrigatória:** `users.mustChangePassword` força a pessoa a trocar
  a senha temporária (definida pelo Admin na criação ou numa redefinição)
  antes de usar o resto da app — ver `ForcedPasswordChangeScreen` em
  `DashboardLayout.tsx`.
- **Mensagem de login sempre genérica** ("E-mail ou senha inválidos"),
  inclusive para conta desativada — decisão deliberada, não esquecimento.
  Distinguir "senha errada" de "conta desativada" confirmaria pra quem está
  tentando logar que aquele e-mail existe no sistema. Quem desativa uma
  conta é sempre um Admin, que já sabe — avisar a pessoa é responsabilidade
  dele, fora desse fluxo (a tela de Usuários mostra um lembrete ao
  desativar). Timing também normalizado: e-mail inexistente roda
  `argon2.verify` contra um hash-dummy (`UNUSABLE_PASSWORD_HASH`) mesmo
  assim, pra não vazar por tempo de resposta quais e-mails têm conta.
- **Rate limit:** 10 tentativas / 15 min, chave = IP + e-mail normalizado
  (não só IP — um escritório inteiro pode sair pelo mesmo IP).
  `server/_core/passwordAuth.ts`.
- **Sem estado "pendente".** Só o Admin cria conta, e ela já nasce ativa —
  criação e aprovação são o mesmo evento agora. `approvedAt`/`approvedBy`
  continuam existindo no schema, mas passaram a registrar quando/quem criou
  a conta, não uma aprovação de acesso pendente.
- **Bootstrap do primeiro Admin em produção:** `pnpm create-admin`
  (`scripts/create-admin.ts`), recebe `ADMIN_NAME`/`ADMIN_EMAIL`/
  `ADMIN_PASSWORD` inline na invocação (nunca em `.env` — é senha em texto
  puro). Só CLI, nunca rota HTTP — mesma regra de `scripts/dev-session.ts`
  (bootstrap local, sem relação com este). Resolve o problema do ovo e da
  galinha: sem cadastro público, um banco novo não tem ninguém pra criar o
  primeiro Admin.

## Decisões de escopo — o que NÃO construir

Por ser ferramenta interna de um único time, estas coisas foram deliberadamente
descartadas. Não reintroduza sem conversa explícita:

- **Multi-tenancy.** Nada de `tenantId`/`organizationId` no schema.
- **Escala horizontal, CDN, otimização para picos.** O volume é de dezenas de
  atendentes, não de milhares de usuários anônimos.
- **Onboarding self-service, billing, planos.** Não há clientes externos.
- **LLM próprio.** O atendimento é feito pela Sara, que já tem IA e já opera. Os
  seis agentes internos (Sentinel, Max, Renata, Bia, Sofia, Luna) foram
  desativados. O branch `feat/llm-anthropic` tem uma migração de LLM pronta e
  testada, guardada caso um dia seja necessária para resumo ou classificação.

Na dúvida entre a solução simples e a "escalável", escolha a simples.

## Convenções

- Comentários e mensagens de erro voltadas ao usuário em **português**
- Nomes de código (variáveis, funções, tabelas) em **inglês**
- **Nunca compare rótulo em português contra valor de enum.** O enum do banco é a
  fonte da verdade; o português existe só para exibição. Foi o bug mais
  recorrente do projeto — 5 ocorrências em 6 arquivos, todas silenciosas.
- Rotas HTTP fora do tRPC **precisam** começar com `/api/` para serem roteadas
- `registerWebhooks(app)` é montado **antes** do tRPC, então a proteção padrão do
  tRPC não se aplica a nada em `webhooks.ts` — use os middlewares de
  `server/_core/routeGuards.ts`
- Middlewares de auth novos devem ser **fail-closed**: sem o segredo configurado,
  a rota nega. Nunca abre.
- Comparação de segredos sempre com `timingSafeEqual` e checagem de tamanho antes
  (padrão em `routeGuards.ts:38`)
- Entrada externa sempre validada com Zod. Evite `z.string()` genérico onde
  existe enum — foi um `as any` em `conversations.list` que deixou um bug de
  filtro invisível por meses.
- Campos opcionais de formulário: use os helpers de `server/_core/validators.ts`.
  O front envia `""`, não `undefined` — `.optional()` sozinho não cobre isso.
- Tags padrão são identificadas por `slug`, nunca por id numérico.
- Senha de usuário: hash argon2id, mínimo `MIN_PASSWORD_LENGTH` caracteres,
  nunca "esqueci minha senha" — ver "Autenticação".
- Credenciais de canal ficam em `channelSettings` no banco, configuradas pela
  interface — **não** em variável de ambiente.
- Exceção: segredos de verificação criptográfica (`META_APP_SECRET`,
  `TELEGRAM_WEBHOOK_SECRET`, `SUPPORT_OUTBOUND_WEBHOOK_SECRET`,
  `EMAIL_TICKET_SECRET`) ficam em variável de ambiente. Sem multi-tenancy
  existe um único valor por deploy, que nunca varia por registro; são usados
  só para validar assinatura, nunca editados pela interface; e ficam fora de
  backups e dumps.
- **Cor nova sempre vem de token** (`client/src/index.css` — `--foreground`,
  `--muted-foreground`, `--primary`, `--brand-*`, etc.), nunca hex/oklch cru
  em `style={{}}`. Achado numa varredura (2026): 221 pontos com
  `oklch(..., 155)` — o matiz verde de antes do rebrand pra azul — escritos
  direto no JSX, nunca tinham passado pelo sistema de tokens. Corrigido, mas
  existe **um segundo sistema de cor hardcoded** ainda não tratado: `#0d6b4e`
  e variantes (`rgba(13,107,78,...)`), escrito à mão em `CadenceAutomation.tsx`,
  `CommunicationIntelligence.tsx`, `Conversations.tsx`, `CustomerMilestonesTab.tsx`,
  `Customers.tsx`, `JourneyTab.tsx` — majoritariamente uso semântico (status
  "ativo"/"conectado", não cor de marca), por isso não foi mexido nessa rodada.
  Não reproduza esse padrão em código novo.
- **Pendência registrada, não corrigida**: `client/src/components/TranscriptsTab.tsx`
  roda um tema escuro próprio (`#1a2332` etc.), independente do resto da app
  clara — já destoava antes do rebrand de azul, continua destoando depois.
- **Pendência registrada, não corrigida**: classes Tailwind `emerald-*`/`green-*`
  ainda de cor de marca antiga (não status) em `client/src/pages/PublicForm.tsx`
  (fundo inteiro da página pública de formulário + botão de submit — única
  tela vista por cliente externo) e `client/src/pages/ConversationDetail.tsx`
  (mesmo padrão "cor do atendente humano" já corrigido em `Atendimentos.tsx`,
  ~47 ocorrências, tela de detalhe da mesma conversa). Adiado de propósito,
  não esquecido.

## Backlog — em ordem

Trabalhe um item até o fim antes de abrir o próximo.

### 1. Domínio e deploy

Subdomínio com HTTPS, solicitado ao time de TI. Necessário para receber os
webhooks da Sara. Login não depende mais de redirect URI de provedor
externo (e-mail/senha próprio — ver "Autenticação"); ao subir produção,
rodar `pnpm create-admin` uma vez para criar o primeiro Admin.

### 2. Receptor do webhook da Sara

Depende do item 1 (precisa de URL pública). Especificação já recebida — ver
"Integração — Sara Support API".

### 3. Correções pendentes

- `webhooks.ts:122,329,470` — gravam `email`/`contactEmail` direto do payload de
  webhook sem schema nenhum. Se vier `""`, grava `""` em vez de `null`. É
  superfície de ingestão externa, não formulário: decidir o schema antes.
  (A autenticação de `/api/webhooks/email-ticket`, linha 122, já foi corrigida —
  ver "Segurança"; falta ainda a validação Zod do payload em si.)
- Issue #22 — validação frágil em `customers.list`/`campaigns`/`broadcasts`
- Issue #23 — tipo fraco em `statusConfig`
- Tags "Em Aberto"/"Aguardando" filtram por `conversationTagAssignments`, e nada
  popula essa tabela a partir de `conversations.status`. **Decisão de produto
  pendente com o time de CS:** essas tags devem espelhar o status
  automaticamente ou ser marcação manual do atendente? São produtos diferentes.
- A tag "Automático" (`slug: auto`) foi removida de `DEFAULT_TAGS`
  (`seedDefaults.ts`) e de `TAG_STATUS_MAP` (`Atendimentos.tsx`) — investigada
  e resolvida, não é mais pendente. O filtro sempre retornava lista vazia, e
  informava errado ao atendente ("nenhuma conversa automática" quando na
  verdade o filtro nunca funcionou). Duas causas: dependia de
  `conversationTagAssignments` (mesmo problema do bullet acima) e, mesmo com
  atribuição manual, o client comparava `conversations.status === "auto"`,
  valor que o enum (`Open`/`Waiting`/`Closed`) nunca produz — quebrado de
  forma incondicional. Não havia semântica definida para a tag em nenhuma
  story ou comentário de código. Bancos que já rodaram o seed antigo mantêm a
  tag no banco, rebaixada de sistema para tag comum editável via
  `scripts/downgrade-auto-tag.mjs` (roda uma vez, idempotente). Se o time de
  CS quiser esse filtro de volta, a implementação mais provável é
  `conversations.handledByAi = true`, com tratamento especial no servidor
  (`tags.listUnified` em `routers.ts`), igual ao que já existe para `group`.
- Chaves estrangeiras: as 55 tabelas não têm nenhuma. Decisão separada dos
  índices, com mais risco (cascade, registros órfãos).

### 4. Identificação de cliente via Guru (projeto novo)

Objetivo: quando o atendente assumir a conversa, já ter o contexto do cliente
pronto — quem é, o que comprou, quando, e se está no prazo de reembolso.

**Só começar depois dos itens 1 a 3.**

Fluxo pretendido: cliente entra em contato → coleta de nome, e-mail e CPF →
consulta à Guru → identificação → histórico de compras → contexto para o
atendente. Um cliente → N compras.

**Premissas verificadas — não repetir a investigação:**

- **Não existe integração de saída com a API da Guru.** Só o webhook de entrada
  em `/api/webhooks/guru`, gravando em `guruWebhookEvents`. Nenhum código chama
  a API. O `guruSettings.apiToken` existe no schema mas não é usado.
- A API da Guru **existe e resolve o caso** (docs em
  `https://api.docs.digitalmanager.guru/`): consulta ativa por e-mail/CPF,
  `GET /contacts/{id}/transactions` para histórico completo, e recuperação de
  evento perdido via `GET /transactions/{id}`. Rate limit de 360 req/min por
  conta.
- `customers.guruContactId` **já existe** (`schema.ts:37`) e já é preenchido a
  partir do `contact.id` do webhook (`webhooks.ts:263`). É o identificador
  estável para relacionar cliente e compras.
- **Não existe campo de CPF** em nenhuma tabela. Estrutura nova.
- **Não existe tabela de compras.** Hoje `guruWebhookEvents` guarda payload
  bruto por evento e sobrescreve campos singulares em `customers` a cada evento
  — um snapshot, não histórico. A modelagem 1 cliente → N compras precisa ser
  criada.
- **Data de reembolso não confirmada.** Existe `payment.refund_reason` (motivo),
  mas não foi encontrado campo de data dedicado. Inferir de `dates.updated_at`
  seria suposição. Confirmar com a Guru antes de construir a regra de prazo.

**Sobre a Sara conduzir esse fluxo:** hoje **não é possível**, e não é decisão do
time do Cashmiles. O time da Sara informou que ela não tem etapa de IA que
analisa a conversa e decide escalar — `conversation.escalated` é sinal
estrutural, disparado quando um atendente assume manualmente ou quando a conversa
nasce precisando de humano. Classificação automática está registrada como item em
aberto no roadmap deles. Qualquer plano que dependa da Sara coletar dados e
consultar a Guru precisa ser alinhado com aquele time primeiro.

Regra de reembolso deve ser **configurável por produto/situação**, nunca "7 dias"
fixo no código.

Arquitetura deve permitir adicionar fontes depois (ClickUp, ZapSign, histórico de
atendimento) sem reescrever o núcleo.

CPF é dado pessoal sensível: definir quem pode ver, mascarar por padrão na
interface, nunca logar.

## LGPD e dados pessoais

O sistema processa conversas reais com clientes: nome, telefone, e-mail,
histórico de atendimento. Isso é dado pessoal sob a LGPD **mesmo sendo ferramenta
interna**. Uso interno reduz a superfície de exposição, não a obrigação legal.

- **Os logs vazam dados pessoais hoje.** `server/webhooks.ts` tem ~35
  `console.log`, vários imprimindo e-mail e nome de cliente. Em produção,
  remover ou mascarar.
- Nunca logar telefone, e-mail, documento ou conteúdo de mensagem em produção.
  Não logar payload completo de webhook.
- Ao adicionar log novo, registrar identificador interno (`customerId`), não o
  dado pessoal.
- Definir política de retenção de conversas antes do go-live.

## Integração — Sara Support API

A tela `/sara` integra com a **Sara Support API**, sistema externo em
`https://recupera.agentesreino.com.br` (Epic 71). A Sara é um bot de IA que **já
opera em produção, com clientes reais** no WhatsApp — não é ambiente de teste.

- Cliente HTTP: `server/saraSupportClient.ts`. Router: `server/routers/sara.ts`.
- Autenticação por header `x-api-key` (`SARA_SUPPORT_API_URL`,
  `SARA_SUPPORT_API_KEY`).
- **`POST .../messages` manda mensagem de verdade no WhatsApp do cliente.**
  `takeover`, `release` e `close` alteram o estado real da conversa. Não existe
  ambiente de teste — usar apenas contato de teste conhecido.
- Chave de API única: o `takeoverAdminId` registrado na Sara é sempre o mesmo.
  Existe o header opcional `x-sara-actor-id` para identificar qual atendente do
  Cashmiles executou a ação — **usar em todas as chamadas**.
- Suporta áudio e imagem (multipart) e URLs assinadas de 900s para reproduzir
  mídia recebida. A tela atual só trata texto.

### Webhook de saída da Sara (Epic 72) — a implementar

Especificação recebida do time da Sara:

- Header da assinatura: `x-sara-signature`
- HMAC-SHA256 sobre os **bytes brutos do body**, hex digest, comparação
  timing-safe. Parse e re-serialização quebram a assinatura — preservar o raw
  body como já é feito em `webhookAuth.ts`.
- Secret: `SUPPORT_OUTBOUND_WEBHOOK_SECRET`, fornecido pelo time da Sara
- Eventos: `conversation.escalated`, `conversation.message_received`,
  `conversation.closed`
- Payload: `{ eventId, eventType, timestamp, data }`. O `data` traz
  `conversationId` e, conforme o evento, `phoneNumber`, `whatsappMessageId` ou
  `outcome` (`converted`, `refused`, `superseded`, `completed`, `admin_closed`).
- **Deduplicar por `eventId`** — reenvios usam o mesmo id. Responder 2xx rápido;
  timeout de 10s do lado deles aciona retry.
- O payload **não traz** nome do cliente nem a última mensagem. Para ter
  contexto, chamar `GET /conversations/{id}` após receber o evento.

**Limitação importante:** `conversation.escalated` não significa que a IA pediu
ajuda — significa que alguém assumiu, ou que a conversa nasceu precisando de
humano. O webhook não resolve sozinho o problema de cliente esperando sem
ninguém perceber. Para isso, o Cashmiles precisa vigiar a fila ativamente
(`GET /conversations?status=awaiting_response` + `slaSettings`).

## Armadilhas conhecidas

- **`npm install` falha.** `@builder.io/vite-plugin-jsx-loc@0.1.1` declara peer
  `vite@^4 || ^5`, o projeto usa vite 7. Só resolve com pnpm.
- `wouter@3.7.1` tem patch em `patches/`. Ao subir versão, revalidar o patch.
- Não editar migration já aplicada — gerar nova. Exceção feita uma vez na `0001`
  porque nunca havia aplicado em banco nenhum.
- `getDb()` retorna `null` quando falta `DATABASE_URL` (lazy, intencional para
  tooling local). Código que usa o banco precisa lidar com isso.
- ~139 usos de `any` no `server/`. Os que importam são os de fronteira externa:
  `channelSender.ts` (6 respostas de API de canal sem tipo) e `webhooks.ts:698`
  (payload da Meta). Os outros são imprecisão interna.
- Não existe script de lint. Import morto e afins passam despercebidos —
  `tsc --noEmit` não acusa.

## Segurança — regras invioláveis

- Segredos apenas por variável de ambiente ou `channelSettings`. Nunca no
  repositório, nunca como fallback literal. **O repositório é público hoje** —
  torná-lo privado antes de existir dado real.
- Todo endpoint novo fora do tRPC nasce com guard explícito.
- Validar entrada externa com Zod antes de tocar no banco.
- `.env.example` nunca contém valor real, só descrição e formato.
- `isActive` é verificado em `authenticateRequest` (`sdk.ts`), ponto único por
  onde todo o tRPC passa. Não duplicar a checagem; não criar caminho que a
  contorne.
- `/api/webhooks/email-ticket` ficou sem guard nenhum até ser corrigido — a
  Story 1.1 (validação de assinatura) cobriu WhatsApp/Instagram/Telegram e
  deixou esse endpoint fora do escopo sem justificativa registrada. Hoje exige
  `EMAIL_TICKET_SECRET` (`routeGuards.ts` → `requireEmailTicketSecret`),
  aceito por duas vias — qualquer uma que bata libera:
  - Header `x-email-ticket-secret` — **preferencial**, mesmo padrão de
    `x-cron-secret` (`timingSafeEqual`).
  - Token no path, `/api/webhooks/email-ticket/{token}` — só para
    encaminhadores que não suportam header customizado. Evite quando possível:
    URL vaza em log de acesso/proxy/APM com mais facilidade que header.
  Fail-closed: sem `EMAIL_TICKET_SECRET` configurado, a rota nega sempre.
- Dois estados de acesso (ativo, desativado), derivados só de `isActive` —
  não existe enum próprio. Não existe mais estado "pendente": sem cadastro
  público, só o Admin cria conta, e ela já nasce ativa. `approvedAt`/
  `approvedBy` continuam existindo, mas registram quando/quem **criou** a
  conta, não uma aprovação de acesso pendente — ver "Autenticação".
- Mensagem de login sempre genérica, mesmo para conta desativada — decisão
  deliberada de segurança (não confirmar existência/estado de uma conta pela
  resposta), não descuido. Ver "Autenticação" para o trade-off completo.

## Rodando localmente (Windows)

### 1. Banco

```bash
docker run --name mysql-ominichat -e MYSQL_ROOT_PASSWORD=devlocal \
  -e MYSQL_DATABASE=ominichat -p 3306:3306 -d mysql:8
```

Nas próximas vezes, apenas `docker start mysql-ominichat`.

### 2. `.env` (não versionado)

```
DATABASE_URL=mysql://root:devlocal@localhost:3306/ominichat
JWT_SECRET=<openssl rand -hex 32, mínimo 32 caracteres>
OWNER_OPEN_ID=local-admin
```

O login local agora é e-mail/senha (ver "Autenticação"). Depois de rodar as
migrations (passo 3), crie o primeiro Admin com:

```bash
ADMIN_NAME="Seu Nome" ADMIN_EMAIL=voce@reinoeducacao.com ADMIN_PASSWORD=senha-temporaria-local pnpm create-admin
```

e logue pela tela normal com esse e-mail/senha (vai pedir troca de senha no
primeiro login).

`pnpm dev:session` continua disponível como atalho alternativo, que gera
sessão de Admin sem precisar logar pela UI (ver "5. Sessão local" abaixo) —
**estritamente para desenvolvimento**, nunca em produção.

Não use `echo >> .env`: se o arquivo não terminar em quebra de linha, a variável
nova cola na anterior e o dotenv lê as duas como um valor só. Edite no editor.

### 3. Migrations

```bash
pnpm db:push
```

Se falhar, limpe o banco antes de repetir — MySQL não desfaz DDL em transação:

```bash
docker exec -i mysql-ominichat mysql -uroot -pdevlocal \
  -e "DROP DATABASE ominichat; CREATE DATABASE ominichat;"
```

Recriar o banco também é necessário para exercitar o seed (tags padrão etc.).

### 4. Servidor

```bash
pnpm dev
```

Os scripts `dev` e `start` usam `cross-env` para setar `NODE_ENV` — resolve a
incompatibilidade com o cmd.exe (que o pnpm usa para rodar scripts no Windows e
não entende `NODE_ENV=x comando` na frente do binário).

### 5. Sessão local

```bash
pnpm dev:session
```

Gera um JWT de Admin assinado com o `JWT_SECRET` local. Cole no cookie
`app_session_id` (DevTools → Application → Cookies → duplo clique na coluna
Value → Enter) e recarregue com Ctrl+Shift+R. Confira o Size: um JWT passa de
300 caracteres; se ficar em 14, não salvou.

Script estritamente local: aborta se `NODE_ENV=production` e não expõe rota HTTP.
**Nunca transformar isso em endpoint** — rota que emite sessão de Admin é
backdoor, e backdoor de desenvolvimento tende a sobreviver até produção.

### Armadilhas já resolvidas

- Ao editar migration, manter o marcador `--> statement-breakpoint` no fim da
  linha. Sem ele o Drizzle envia dois comandos numa query só e o MySQL rejeita.
- Usar **dois terminais**: um dedicado ao servidor, outro para git e docker.
- Ruído esperado no log: aviso de `@import` no CSS.
- Variável de ambiente é lida na inicialização (`ENV` em `server/_core/env.ts`
  é montado uma vez, no boot). Editar o `.env` com o servidor rodando não tem
  efeito — reiniciar `pnpm dev` depois de qualquer mudança.
