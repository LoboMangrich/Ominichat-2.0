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
server/saraSupportClient.ts  Cliente HTTP da Sara Support API (doc: docs/sara-support-openapi.json)
server/*.ts           Motores de domínio: automation, playbook, healthScore,
                      conversationRouter, channelSender, channelHealth,
                      communicationIntelligence, csvImport, conversationBackup
shared/               Tipos e constantes compartilhados client/server
drizzle/schema.ts     ~1.200 linhas, 57 tabelas, 37 migrations (0000–0036)
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

### Pendências de cor

- **Falta um token semântico de sucesso/verde.** `client/src/index.css` só tem
  `--brand-*` (azul), `--primary`, `--muted`, `--accent` e `--destructive` —
  nenhum verde. Todo uso de "verde = humano/ativo/conectado" hoje cai na
  paleta crua do Tailwind (`emerald-*`). Na tela `/sara`
  (`SaraConversationDetail.tsx`), a bolha do atendente usa `bg-emerald-700
  text-white` — não `emerald-600`, que com texto branco fica ~3,8:1, abaixo do
  AA (4,5:1). Ao criar o token (`--success` ou similar), migrar esses usos
  junto e manter o contraste AA com texto branco.

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
- Issues #22 e #23 apareciam `CLOSED` no GitHub, mas o código não tinha a
  correção aplicada — `customers.list`/`campaigns.previewAudience`/
  `campaigns.create`/`broadcasts.create` aceitavam `status`/`filterStatus`
  como `z.string()` solto (`as any` no `eq()`), e `statusConfig`
  (`Customers.tsx`) era `Record<string, ...>`. Corrigido nesta sessão: os
  quatro procedures agora usam `z.enum(customers.status.enumValues)`, e
  `statusConfig` é `Record<(typeof customersTable.status.enumValues)[number], ...>`
  — uma chave errada ou um enum alterado no schema agora quebra `pnpm check`
  em vez de falhar em silêncio. `referralsRouter.list`/`updateStatus`/`create`
  receberam o mesmo tratamento com `referrals.status.enumValues`/
  `referrals.type.enumValues`, e o filtro de status de `Referrals.tsx` tinha
  o mesmo bug recorrente (`"Pendente"` como valor do `SelectItem`, em vez de
  `"Pending"`) — corrigido junto.
- **Pendência nova, achada ao corrigir o item acima:** `upsellRouter.list`
  (`server/routers.ts`, roteador registrado em `upsell: upsellRouter`)
  consulta a tabela `referrals`, não `upsellOpportunities` — usa
  `referrals.status`/`referrals.type` em vez do enum real de
  `upsellOpportunities.status` (`Identified/Presented/Accepted/Declined`). Só
  o `updateStatus` desse router usa a tabela certa. Nenhum código do client
  chama `trpc.upsell.*` (confirmado por grep) — a tela "Indicações & Upsell"
  (`Referrals.tsx`) usa `trpc.referrals.*` com `type: "Upsell"` dentro da
  própria tabela `referrals`. **Decisão pendente:** a tabela
  `upsellOpportunities` está abandonada (e o router deveria ser removido ou
  redirecionado para `referrals`), ou o router é que está errado (e deveria
  passar a consultar `upsellOpportunities` de verdade, exigindo um
  consumidor novo no client)? Não mexido nesta rodada — deixado de propósito
  fora do escopo, aguardando essa decisão de produto.
- **Verificação pendente antes do deploy:** `campaigns.filterStatus`
  (`varchar(50)` solto, sem enum no schema) agora é validado contra
  `customers.status.enumValues` na entrada de `campaigns.previewAudience` e
  `campaigns.create`, então não é mais possível persistir um valor inválido
  a partir de agora. Mas isso não corrige registros já gravados antes da
  validação existir. Como não há deploy em produção hoje, o risco é só de
  dados locais de teste — não foi checado nesta sessão (Docker local
  indisponível no momento). **No dia do deploy**, antes de apertar qualquer
  validação adicional em cima de `campaigns.filterStatus`, rodar
  `SELECT DISTINCT filterStatus FROM campaigns` e comparar contra
  `customers.status.enumValues`; se houver linha fora do enum, decidir o
  tratamento (null, valor mais próximo, ou remover o filtro daquela
  campanha) antes de qualquer migração de dados.
- Tags "Em Aberto"/"Aguardando": **na tela única (`/sara`) já filtram pelo
  status real** (`conversations.status` no canal próprio, status da Sara) —
  ver "Tela única de Conversas". O caminho antigo via `tags.listUnified({ tagId })`
  continua filtrando por `conversationTagAssignments`, que nada popula a partir
  de `conversations.status`; só `Atendimentos.tsx` (hoje sem rota) usava isso.
  Se `conversationTagAssignments` for mantida para etiquetas personalizadas,
  não reusar para status.
- **Status `Waiting` ficou sem nenhum ponto de escrita na interface.** O
  seletor de 3 opções (Aberto/Aguardando/Encerrar) em `ConversationDetail.tsx`
  foi substituído por um botão único "Finalizar conversa" (→ `Closed`) — era o
  único lugar do app que gravava `conversations.status = "Waiting"`. Nenhuma
  automação, playbook, trigger rule ou SLA grava esse status. A aba
  "Aguardando" de `Conversations.tsx` (`QUEUE_TABS`) foi removida junto — sem
  isso, ela filtraria por um status nunca gravado e mostraria zero pra
  sempre, o mesmo padrão de filtro-morto já corrigido várias vezes neste
  projeto. O enum `conversations.status` continua com `"Waiting"` no schema
  (não removido — é dado histórico válido para conversas antigas). **Se o
  time de CS quiser o conceito de "aguardando resposta do cliente" de volta,
  falta decidir:** esse status é definido manualmente pelo atendente (como
  era antes) ou automaticamente (ex: quando o atendente responde e fica
  esperando o cliente)? A resposta muda a implementação e a aba volta junto.
- **Histórico de conversas finalizadas com opção de reabrir.** Na tela única
  (`/sara`), uma conversa `Closed` do canal próprio aparece só em "Todos",
  com selo "Encerrada" (as abas Em Aberto/Aguardando filtram por status real).
  O problema que resta é que não há aba própria de finalizadas nem ação de
  reabrir — o botão "Finalizar conversa" fica desabilitado em
  "Conversa encerrada". (`/conversations` tem uma aba "Finalizados"
  funcionando, mas não está no menu.) `conversations.updateStatus` já aceita
  `"Open"`, mas não limpa `closedAt`, e finalizar de novo repete a análise de
  IA e a pesquisa de satisfação. **Direção decidida, story ainda não
  escrita** — aguardando o time de CS confirmar a janela de 24h: cliente que
  escreve de novo dentro da janela (configurável) reabre a mesma conversa,
  depois dela abre uma nova; aba de finalizadas na tela única (`/sara`), com elas
  escondidas por padrão; qualquer atendente pode reabrir; `closedAt` limpo ao
  reabrir; mensagem `system` registrando quem reabriu; pesquisa de satisfação
  não repete. A regra da janela entra em `pickReusableConversation`
  (`server/conversationLookup.ts`). Referência mencionada pelo time:
  comportamento do Chatsac.
- **Disparo de campanha pode gravar mensagem de WhatsApp em conversa de
  outro canal.** `campaigns` (bloco de envio em `server/routers.ts`, "Find or
  create a conversation for this customer") busca conversa `Open` do cliente
  sem filtrar `channel` e agenda mensagem de WhatsApp nela — se o cliente
  tiver uma conversa de e-mail aberta, a campanha cai nela. Também ignora
  `Waiting`. É a mesma classe de bug corrigida nos 5 receptores de webhook
  (que agora usam `findOrCreateOpenConversation`), mas ficou fora daquele PR
  por não ser receptor. Correção provável: trocar pela mesma função.
- **Criação de conversa não é atômica.** `findOrCreateOpenConversation`
  (`server/conversationLookup.ts`) faz select e depois insert: duas mensagens
  simultâneas de um cliente sem conversa aberta ainda podem criar duas
  conversas. Risco baixo no volume atual (dezenas de atendentes); resolver
  exigiria lock ou unique constraint, e não vale a complexidade agora.
  Conversas duplicadas já gravadas pelo bug antigo não foram limpas — sem
  produção, o banco local se resolve recriando.
- **Travar envio de mensagem a quem não assumiu a conversa.** Hoje, se uma
  conversa é transferida para outro atendente, qualquer pessoa ainda
  consegue responder ao cliente pelo `messages.send`. O esperado: só quem
  assumiu (`conversations.assignedUserId` — ver "Atribuição no canal próprio"
  em "Tela única de Conversas") envia mensagem pro cliente; os demais
  podem deixar sussurros (mensagens internas, tabela `internalMessages` já
  existe). A infraestrutura (`assignedUserId` + `internalMessages`) já existe —
  falta decisão de produto antes de implementar: Admin pode enviar em
  conversa de outro atendente? Como alguém retoma uma conversa que não é
  sua? Sussurro é visível para todos os atendentes ou só para quem tem
  acesso àquela conversa?
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
- Chaves estrangeiras: as 57 tabelas não têm nenhuma. Decisão separada dos
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

## Roadmap de interface — itens removidos do menu

Em 2026, 37 itens de menu marcados `soon: true` (`client/src/components/DashboardLayout.tsx`,
`NAV_MODULES`/`SETTINGS_ITEMS`) foram **removidos** — não escondidos, removidos —
por apontarem pra telas que não existem. Cada um resolvia pra uma rota já
existente com um parâmetro de query diferente (`?canal=`, `?view=`, `?tab=`),
mas nenhuma dessas páginas lê esses parâmetros — verificado antes de remover,
não é suposição. Diferente do caso das páginas órfãs (existiam e funcionavam,
só faltava o link): aqui a funcionalidade em si não existe.

**Isto não é código perdido — é roadmap movido para onde ele deveria estar.**
O caminho pra reativar qualquer item é: implementar a tela/funcionalidade de
verdade, então devolver a entrada correspondente em `NAV_MODULES`/
`SETTINGS_ITEMS` (sem `soon: true` — esse campo foi removido do tipo `NavLeaf`
junto, ficava sem nenhum uso depois da remoção, assim como a classe CSS
`.nav-soon-badge`/`.nav-leaf--soon`).

### Atendimento (13 itens)

E-mail (sectionHeader "Atendimento via E-mail" — inteira, ficaria sem nenhum
item se um único sobrasse):
- Caixa de Entrada — `/atendimentos?canal=email`
- Caixa de Saída — `/atendimentos?canal=email&view=saida`
- Respondidos — `/atendimentos?canal=email&view=respondidos`
- Não Respondidos — `/atendimentos?canal=email&view=nao-respondidos`

Em Breve (sectionHeader "Em Breve" — inteira):
- Instagram Direct — `/atendimentos?canal=instagram`
- Facebook Messenger — `/atendimentos?canal=facebook`
- Telegram — `/atendimentos?canal=telegram`
- Chat do Site — `/atendimentos?canal=chat`
- SMS — `/atendimentos?canal=sms`
- Voz (VoIP) — `/atendimentos?canal=voz`
- LinkedIn — `/atendimentos?canal=linkedin`
- TikTok — `/atendimentos?canal=tiktok`
- X (Twitter) — `/atendimentos?canal=twitter`

### CRM (11 itens)

- Carteiras — `/customers?view=carteiras`
- Empresas — `/customers?view=empresas`
- Negócios — `/customers?view=negocios`
- Pipeline — `/customers?view=pipeline`
- Funil Comercial — `/customers?view=funil`
- Oportunidades — `/customers?view=oportunidades`
- Agenda — `/customers?view=agenda`
- Histórico do Cliente — `/customers?view=historico`
- Documentos — `/customers?view=docs`
- Anotações — `/customers?view=notas`
- Timeline — `/customers?view=timeline`

### Estatísticas (7 itens)

- Metas — `/indicators/health?view=metas`
- Tempo Médio — `/indicators/health?view=tma`
- Conversões — `/indicators/health?view=conversoes`
- Receita — `/indicators/health?view=receita`
- Auditoria — `/indicators/health?view=auditoria`
- Logs — `/indicators/health?view=logs`
- Exportações — `/indicators/health?view=exports`

### Configurações (6 itens)

- Permissões — `/settings?tab=permissions`
- API — `/settings?tab=api`
- Webhooks — `/settings?tab=webhooks`
- Automações — `/ia-automation?view=automacoes`
- Financeiro — `/settings?tab=financeiro`
- Assinatura — `/settings?tab=assinatura`

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
- **Fonte da verdade: `docs/sara-support-openapi.json`** (doc OpenAPI enviada
  pelo time de TI). Enum de status do `GET /conversations`:
  `awaiting_response`, `active`, `error`, `human_takeover` (`shared/sara.ts`,
  validado com `z.enum` no router). Status ou `senderType` fora do documentado
  aparecem com o valor cru, nunca com rótulo inventado. "Encerrar" pede
  confirmação: não há "reabrir" do lado do Cashmiles.
- **`actorId` — quem assumiu.** É o que mandamos em `x-sara-actor-id` (o nosso
  `users.id` em string); a Sara só registra, para auditoria. `null` quando a
  conversa foi assumida sem o header (ex.: pelo painel da própria Sara) ou
  depois de `/release`. O router resolve para o nome do usuário do Cashmiles
  ("Assumido por …"; id desconhecido → "outro atendente"). **Regras, checadas
  NO SERVIDOR com um GET antes de qualquer POST** (`saraCanSend`/
  `saraCanReleaseOrClose`, `shared/sara.ts`) — recusa é `FORBIDDEN` sem chamar
  a Sara:
  - **Enviar mensagem:** só quem assumiu. Admin **não** é exceção. `actorId`
    `null` bloqueia, com o aviso "Assumida sem identificação de atendente. Se
    ninguém da equipe está nela, devolva para a IA e assuma de novo." (não
    empurra a devolução: pode ter sido assumida pelo painel da Sara).
  - **Devolver para a IA / Encerrar:** quem assumiu, Admin, ou qualquer
    atendente quando `actorId` é `null`. Nos outros casos, "Conversa assumida
    por outro atendente".
- **409 do `/takeover`** → `CONFLICT` "Já assumida por <nome>", a partir de
  `conversation.actorId` do corpo do 409. 409 sem `conversation` (ex.: "not
  claimed" no envio) → `CONFLICT` genérico. O corpo do erro fica só no
  servidor (`SaraSupportApiError.body`), nunca vai ao navegador.
- **Mídia recebida** (áudio e imagem): `sara.audioUrl`/`sara.imageUrl` →
  `GET /audio/{id}/url` e `/images/{id}/url`, URL assinada que **expira em
  900s**. Buscada sob demanda (áudio ao clicar, imagem ao renderizar),
  `staleTime`/`gcTime` bem abaixo de 900s, e nova busca se o `<audio>`/`<img>`
  der erro (`client/src/components/conversations/SaraMedia.tsx`). **Nunca
  logar a URL assinada.**
- **Perguntas em aberto para o time de TI:**
  - Um `/takeover` sobre conversa em `human_takeover` com `actorId` `null` é
    aceito, ou devolve 409? Se for aceito, "assuma de novo" funciona direto,
    sem devolver para a IA (e sem a janela em que a IA pode responder o
    cliente).
  - `POST .../audio` e `POST .../image`: **nome do campo multipart** e
    **formatos aceitos** (a doc só diz "multipart/form-data").
  - `/templates`: **formato da resposta** (o `GET` tem 200 sem corpo descrito;
    o `POST` não tem 200 nenhum).
  - **Prévia da última mensagem e contador de não lidas:** o `GET
    /conversations` não traz nenhum dos dois (só `messageCount` e
    `lastMessageAt`). A lista da tela única não mostra prévia nem "não lidas"
    por isso. A Sara pode passar a mandar `lastMessageText`/`unreadCount`?
  - **Prompts (`/prompts`):** corpo do `POST /prompts` e formato das
    respostas de `GET /prompts` e `POST /prompts/{id}/activate` — a doc não
    traz nenhum dos dois (ver "Prompt da Sara" abaixo).
- **Prompt da Sara (`GET`/`POST /api/v1/support/prompts`,
  `POST /api/v1/support/prompts/{id}/activate`) — NÃO implementar ainda.**
  Esses endpoints **alteram a IA que fala com clientes reais**: ativar uma
  versão troca, na hora, o comportamento da Sara em produção. A doc não traz o
  corpo do `POST` nem o formato das respostas (perguntado ao TI). Nenhum
  código para eles existe no Cashmiles.
  - **Não aceitam `x-sara-actor-id`.** Quando forem implementados, o registro
    de quem criou e quem ativou cada versão (e quando) tem que ficar no
    Cashmiles — a Sara não guarda.
  - **Proteções já decididas para a futura tela "Prompt da Sara":**
    - só Admin, checado **no servidor** (não só esconder o botão);
    - criar ≠ ativar: criar gera versão inativa; ativar é ação separada;
    - antes de ativar, comparação lado a lado com a versão ativa;
    - confirmação digitando "ATIVAR";
    - reverter = ativar a versão anterior (não existe "desfazer" próprio).
- **Pendências — fora do escopo até agora:**
  - Envio de áudio e imagem (depende da resposta acima sobre o multipart). O
    composer não mostra botão de anexo/áudio/imagem — nem desabilitado.
  - Opt-out (`GET /contacts/{phone}/opt-out`), números bloqueados
    (`/blocked-numbers`) e templates (`/templates`, `/templates/sync`) —
    **a doc não tem schema de resposta para eles** (só os 4XX/5XX, ou um 200
    sem corpo descrito). Pedir exemplo de resposta ao time de TI antes de
    implementar.
  - **Pesquisas via Sara (NPS/CSAT).** Hoje as pesquisas saem pelo canal
    próprio (outro número de WhatsApp); por isso não entram no painel da
    conversa da Sara. Mandar pela Sara depende de templates (acima).
  - Agendar e encaminhar mensagem não existem para conversas da Sara.

### Conversa da Sara — o que é só do Cashmiles

A conversa é da Sara; estes dados sobre ela ficam **só no Cashmiles** e nunca
vão para a Sara (tabelas da migration `0036`, id da Sara como `varchar(64)`):

- **Nota interna** (`saraInternalNotes`, `sara.addNote`/`listNotes`): aba
  "Nota Interna" no composer, qualquer atendente escreve (não depende de ter
  assumido), aparece intercalada com as mensagens por horário, estilo âmbar.
  Nunca logar o texto da nota.
- **Etiqueta personalizada** (`saraConversationTags`, reaproveita
  `conversationTags`): só etiquetas sem `slug` são atribuíveis — as de status
  vêm do status real. A aba da etiqueta na tela única traz também conversas
  da Sara via `sara.listTaggedConversations`: a API da Sara não filtra por
  etiqueta, então buscamos cada conversa por id — **até 50 ids, no máximo 5
  GETs em paralelo** (`server/concurrency.ts`), **sem polling**, `staleTime`
  60s. Numa etiqueta personalizada, a conversa aparece qualquer que seja o
  status (inclusive `error`).
  - **Id etiquetado que a Sara responde 404 some da lista sem erro, mas a
    linha em `saraConversationTags` NÃO é apagada automaticamente.** Se
    acumular, limpar manualmente (ou decidir uma rotina de limpeza).
- **Cadastrar cliente pela conversa** (`sara.registerCustomer`): o telefone
  vem do `GET` da conversa na Sara, **nunca do client**, e é gravado como só
  dígitos com DDI (`5548984053595`) — o formato dos webhooks de WhatsApp
  Cloud/Z-API/Evolution, que procuram o cliente por igualdade exata
  (`eq(customers.phone, from)`); outro formato criaria cliente duplicado na
  próxima mensagem por esses canais. Duplicado → `CONFLICT` "Já existe
  cliente com este telefone".
- **"Digitando..."** (`sara.sendTyping`): chamada real ao cliente. Só o dono
  (`saraCanSend`, checado no servidor), no máximo 1 a cada 5s enquanto digita.

**Etiqueta no canal próprio é outra coisa — não mexido.** O botão "Etiqueta"
do `ConversationDetail` grava **texto livre** em `conversationLabels`
(`conversations.addLabel`), não em `conversationTags`. E nenhuma tela chama
`tags.assign`, então `conversationTagAssignments` nunca é populada: a aba de
etiqueta personalizada, para conversas do canal próprio, continua sempre vazia.
Unificar isso (o botão do canal próprio passar a usar `conversationTags`) é
decisão separada.

### Tela única de Conversas (`/sara`)

Decisão de produto: "Conversas" é **uma tela só**, com as conversas da Sara e
as do canal próprio juntas. É o único item de conversa no menu de
Atendimento (ao lado de Disparos em Massa e Grupos).

- `Sara.tsx` junta `sara.listConversations` + `tags.listUnified`. Tipo único,
  helpers e mapeamentos em `client/src/pages/saraShared.ts`.
- **Abas = etiquetas**, com o mesmo visual de chips da antiga
  `Atendimentos.tsx`: Todos + as etiquetas de `tags.list` + engrenagem do
  `TagManagerModal` (`client/src/components/conversations/`). As etiquetas
  padrão, identificadas por `slug`, filtram pelo **status real** — nunca por
  `conversationTagAssignments`, que nada popula (era a causa de "Em
  Aberto"/"Aguardando" sempre vazias em `/atendimentos`):

  | Aba | Sara | Canal próprio (`tags.listUnified`) |
  |---|---|---|
  | Todos | sem filtro (inclui `error`) | sem `status` (inclui `Closed`), `excludeGroups: true` |
  | Em Aberto (`open`) | `active` + `human_takeover` | `status: "Open"`, `excludeGroups: true` |
  | Aguardando (`waiting`) | `awaiting_response` | `status: "Waiting"`, `excludeGroups: true` |
  | Grupos (`group`) | não aparece | `tagId` da tag `group` (só grupos) → `GroupConversationPanel` |
  | Etiqueta personalizada | não aparece (aviso: a Sara não tem etiquetas) | `tagId`, `excludeGroups: true` |

  **A aba Aguardando traz só conversas da Sara, e isso é esperado:** desde o
  PR #38 nada grava `conversations.status = "Waiting"` no canal próprio (ver
  Backlog, item 3).
- **Rótulo à direita de cada item** (buckets, `SARA_STATUS_BUCKET`/
  `legacyBucket`): Sara `active` → "Com a IA", `human_takeover` →
  "Atendimento humano", `awaiting_response` → "Aguardando resposta", `error`
  → "Erro", qualquer outro → valor cru. Canal próprio: `Closed` →
  "Encerrada"; senão `handledByAi` decide entre "Com a IA" e "Atendimento
  humano" — inclusive em `Waiting` (decisão deliberada). Enum de status da
  Sara conforme a doc nova do `GET /conversations`: `awaiting_response`,
  `active`, `error`, `human_takeover`.
- **URL:** `/sara/:id` (Sara — links antigos continuam funcionando),
  `/sara/legado/:id` (canal próprio, `ConversationDetail` embutido) e
  `/sara/grupo/:id` (grupo, `whatsappGroups.id`).
- **Links diretos:** `?conversationId=X` abre a conversa X do canal próprio.
  `?customerId=X` abre a conversa mais recente do cliente: a última do canal
  próprio (`customers.getLastInteractions`) contra as da Sara achadas pelo
  telefone do cliente, com e sem o 9º dígito (`e164Candidates`,
  `shared/phone.ts` — no máximo 2 consultas de leitura à Sara, em paralelo).
  `Customers.tsx` e `Home.tsx` apontam direto para `/sara`.
- **Busca:** o filtro `phone` da Sara é E.164; só vai para a API quando o
  termo é telefone completo (`toE164Phone`). Nome ou número parcial filtram
  no client as conversas da Sara já carregadas. O canal próprio sempre
  recebe o termo.
- Falha de uma fonte não esvazia a tela: mostra a outra + aviso.
- Cliente com conversa nas duas origens aparece duas vezes, uma com cada
  selo — são conversas diferentes, não há deduplicação.
- **`/atendimentos` não é mais tela:** a rota só redireciona para `/sara`,
  preservando `?customerId=`/`?conversationId=`. **`client/src/pages/Atendimentos.tsx`
  ficou sem uso** (nenhuma rota o importa) e pode ser removido depois — junto
  com `TAG_STATUS_MAP` e `Atendimentos.statusFilter.test.ts`, que só existem
  para ele. `TagManagerModal`, `GroupConversationPanel` e `timeAgo` já foram
  extraídos e não saem junto.
- **Limitações conhecidas:**
  - "Em Aberto" na Sara são dois status, e a API filtra por um só: a tela
    busca sem filtro e separa no client, então uma página pode vir com menos
    conversas abertas que o `limit` ("Carregar mais" continua funcionando).
  - A Sara aceita `limit` até 100: "Carregar mais" para de crescer do lado
    da Sara nesse ponto (paginação por `offset` não implementada).
  - Grupo só abre se estiver na lista carregada (o painel precisa do nome).
  - O badge "live" de conversas abertas, que ficava no item de
    `/atendimentos`, saiu junto com ele — contava só o canal próprio e
    ficaria enganoso na tela única.
  - **Contadores das abas de atribuição são da PÁGINA carregada, não o
    total** (já com a etiqueta escolhida); "20+" quando pode haver mais. A API
    da Sara não filtra nem conta por `actorId`, então não há total confiável
    para "Minhas" do lado da Sara.
  - "Conversas anteriores" (painel do cliente) só traz da Sara o que o `GET
    /conversations` devolve — o enum de status não tem "encerrada", então
    conversas antigas já encerradas na Sara podem não aparecer.

#### Layout da tela (inspirado no Chatwoot — ideias, nada copiado)

- **Faixa acima do composer** (conversa da Sara), no lugar de campo
  desabilitado, sempre com a ação que resolve (`saraComposerBanner`, sem regra
  nova — só reflete `saraCanSend`/`saraCanReleaseOrClose`): `active` → "A Sara
  está atendendo" + [Assumir]; `awaiting_response` → "A Sara aguarda resposta
  do cliente" + [Assumir]; `error` → "Conversa com erro na Sara", sem botão;
  assumida por outro → "Assumida por <nome>" (+ [Devolver para IA] só com
  `canReleaseOrClose`, na prática Admin); sem identificação → o aviso de
  sempre + [Devolver para IA]; assumida por mim → sem faixa.
- **Abas de atribuição** (Minhas | Não atribuídas | Todas), numa linha acima
  das etiquetas; as duas combinam. Sara: Minhas = assumida por mim; Não
  atribuídas = `active`/`awaiting_response` (filtro no client). Canal próprio:
  `tags.listUnified({ assignee })`, filtro no servidor por `assignedUserId`.
  Grupos não têm atribuição. Default Todas; última escolha no `localStorage`
  por usuário (`conversas.atribuicao.<userId>`).
- **Painel do cliente** em seções recolhíveis (`SaraCustomerPanel.tsx`,
  estado em `localStorage`): Cliente, Saúde e financeiro, Próximas tarefas,
  Conversas anteriores (Sara por telefone + canal próprio por `customerId`,
  máximo 10) e **Notas do cliente** (`customerNotes` — não confundir com a
  "Nota interna" da conversa, `saraInternalNotes`).
- **Card da lista:** iniciais de quem assumiu, com o nome no tooltip.
- **Telas menores:** abaixo de 1280px (`xl`) o painel do cliente começa
  recolhido e abre por cima do chat pelo botão "Cliente"
  (`client/src/lib/customerPanelLayout.ts`) — na Sara e no `ConversationDetail`.

#### Atribuição no canal próprio — dois campos dessincronizados

"Quem assumiu" no canal próprio = **`conversations.assignedUserId`** (decisão
de produto). Mas o schema tem **dois** campos, gravados por fluxos
diferentes, e eles não se falam:

| Grava | Campo |
|---|---|
| `conversations.takeOver` ("Assumir Controle") / `returnToAI` ("Devolver para IA") | `assignedUserId` (= você / `null`) |
| `conversations.create`, `conversations.forward` (transferência), `aiAgents.escalate`/`returnToAi`, `campaigns.send` | `assignedAgentId` |

- **Leem `assignedAgentId`:** SLA em tempo real (`slaRouter.realtime`),
  relatórios por atendente (`reportsRouter.generate`) e o filtro/nome de
  atendente de `conversations.list` (tela `/conversations`).
- **Leem `assignedUserId`:** só a tela única (abas e card), a partir deste PR.
- Consequência: "Assumir" não aparece no SLA nem nos relatórios, e
  transferir não muda quem aparece em "Minhas".
- **Correção (unificar os dois na origem — `takeOver` também gravar
  `assignedAgentId`, `forward` também gravar `assignedUserId`, ou migrar para
  um campo só) fica para PR separado.**

### Decisão de arquitetura — Sara como canal único de WhatsApp

A Sara passa a ser o **canal único de atendimento por WhatsApp**. O Cashmiles
deixa de receber mensagem por webhook próprio e passa a consumir as conversas
pela API da Sara.

Divisão de responsabilidade:

- **Sara é dona das conversas:** WhatsApp, IA, histórico, assumir, encerrar.
- **Cashmiles é dono do cliente:** cadastro, NPS, renovação, tarefas, jornada,
  health score, campanhas, alertas.
- **A ligação entre os dois é o telefone.**
- **O health score continua sendo calculado pelo Cashmiles.** A API da Sara não
  tem esses dados e não deve tê-los — não mover esse cálculo nem mandar esses
  dados para lá.

Consequência a tratar **quando a Sara estiver pronta** (não antes):

- Ficam sem uso os receptores de conversa em `server/webhooks.ts`:
  `/api/webhooks/whatsapp`, `/api/webhooks/zapi`, `/api/webhooks/evolution` e,
  possivelmente, `/api/webhooks/instagram` e `/api/webhooks/telegram`.
- Continuam necessários, porque não são de conversa: `/api/webhooks/guru`,
  `/api/webhooks/ghl`, `/api/webhooks/pagarme` e `/api/webhooks/email-ticket`.

**Não remover nada ainda.** O time de TI ainda vai ajustar as rotas da Sara, e
o webhook de notificação Sara → Cashmiles não existe — o que há abaixo é só a
especificação recebida. Até lá, o caminho próprio fica como está.

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
- **Bloco `@theme` (Tailwind 4, `client/src/index.css`) só aceita custom
  properties e `@keyframes` no corpo dele — nenhum comentário `/* */`.** Um
  comentário ali derruba a compilação do CSS **inteiro**, não só daquele
  bloco. O sintoma não parece nada com a causa: a página carrega sem
  nenhum estilo (texto claro sobre fundo branco, como se as variáveis CSS
  não existissem), sobrevive a hard refresh (não é cache — o CSS nunca
  chegou a compilar), e `tsc --noEmit`/`pnpm check` não acusam nada (é erro
  de CSS, não de TypeScript). O erro real só aparece no overlay de erro do
  Vite no navegador — **não** no terminal do `pnpm dev`. Se a UI carregar
  "crua", esse é o primeiro lugar a olhar antes de suspeitar de cache ou
  processo zumbi.

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
