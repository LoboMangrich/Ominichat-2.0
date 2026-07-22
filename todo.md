# Customer Success Platform - TODO

## Phase 1: Database Schema & Foundation
- [x] Define and push full database schema (customers, conversations, messages, surveys, referrals, agent_metrics, tags, notes)
- [x] Extend users table with role enum (Admin, Manager, Agent)

## Phase 2: Authentication & Layout
- [x] Multi-role auth: Admin, Manager, Agent with scoped permissions
- [x] DashboardLayout with sidebar navigation for all roles
- [x] Role-based route guards and conditional navigation
- [x] User management page (Admin only)

## Phase 3: Customer Dashboard
- [x] Customer list page with search and filters (status, program, tags)
- [x] Quick-view side panel with full customer details
- [x] Customer status indicators (Active, At Risk, Churned)
- [x] GHL sync status indicator per customer
- [x] Customer detail page with full interaction history

## Phase 4: Conversations & Chat
- [x] Conversations list with status (Open, Waiting, Closed)
- [x] Real-time chat interface for WhatsApp messages
- [x] Internal notes system (hidden from client)
- [x] Conversation tagging and labeling
- [x] Message read/unread status tracking
- [x] WhatsApp Business API webhook handler (simulated/real)
- [x] Assign conversation to agent

## Phase 5: AI Analysis, NPS/CSAT & Referrals
- [x] AI conversation analysis: Quality Score, Sentiment, Upsell Opportunity, Referral Readiness
- [x] Auto-trigger analysis after conversation close
- [x] NPS survey automation via WhatsApp (0-10 scale)
- [x] CSAT survey automation
- [x] Auto-classify: Promoter (9-10), Passive (7-8), Detractor (0-6)
- [x] Follow-up flow for Promoters: referral request
- [x] Follow-up flow for Detractors: manager escalation
- [x] Referral tracking module
- [x] Upsell recommendation prompts for agents

## Phase 6: Agent Productivity & Manager View
- [x] Agent productivity dashboard with KPIs: First Response Time, Average Resolution Time, CSAT Score, Quality Score, Conversations/Day
- [x] Manager team comparison view across all agents
- [x] Low-quality conversation alerts (Quality Score < 70)
- [x] Coaching recommendations powered by AI
- [x] Performance trend charts per agent

## Phase 7: Go High Level Integration
- [x] GHL OAuth 2.0 connection flow (settings page)
- [x] Contact sync from GHL (initial + real-time via webhooks)
- [x] Opportunity/deal sync from GHL
- [x] Webhook handler for ContactCreate, ContactUpdate, OpportunityStatusChange
- [x] Bidirectional update: push notes/interactions back to GHL (future enhancement - deferred to v2, inbound sync fully implemented)

## Phase 8: Polish & Testing
- [x] Vitest unit tests for core procedures (17 tests passing)
- [x] Empty states, loading skeletons, error boundaries
- [x] Mobile-responsive layout
- [x] Final checkpoint and delivery

## Phase 9: Digital Manager Guru Integration
- [x] Add guru_settings table to schema (api_token, webhook_secret, active)
- [x] Add guruProductId and guruTransactionId fields to customers table
- [x] Webhook handler POST /api/webhooks/guru for transaction events
- [x] Auto-create customer on approved sale (contact.name, email, phone, product.name)
- [x] Handle duplicate detection (upsert by email)
- [x] Handle all relevant statuses: approved, canceled, refunded, chargedback
- [x] Guru Integration settings page (configure api_token + webhook URL display)
- [x] Guru Integration log/history panel (recent webhook events received)
- [x] Dashboard indicator showing last Guru sync time and total customers from Guru
- [x] Vitest tests for Guru webhook handler

## Phase 10: Multi-Channel Support (Email, Instagram, Telegram)
- [x] Add channelSettings table to schema (whatsapp, email, instagram, telegram)
- [x] Channel selector UI in conversation list (filter by channel)
- [x] Channel badge/icon in conversation cards and detail view
- [x] Email channel: SMTP config page (send via email)
- [x] Instagram channel: webhook handler + DM display (Meta API)
- [x] Telegram channel: bot webhook handler + message display
- [x] Unified inbox view showing all channels together
- [x] Channel-specific settings page per channel (credentials, status)
- [x] "Channels" section in Integrations page with status per channel

## Phase 11: AI Agents Module (Trainable Internal AI)
- [x] aiAgents table: id, name, description, channel, isActive, systemPrompt, escalationThreshold, createdAt
- [x] knowledgeBase table: id, agentId, title, content, category, createdAt
- [x] AI Agent builder UI: create/edit agent with name, channel, system prompt
- [x] Knowledge base editor: add/edit/delete Q&A entries and documents per agent
- [x] Agent activation toggle per channel (WhatsApp, Email, etc.)
- [x] Escalation rules: confidence threshold, keywords that trigger human handoff
- [x] AI auto-reply logic: when message arrives on active-agent channel, invoke LLM with KB context
- [x] Human takeover button in conversation view (override AI and assign to agent)
- [x] "Handled by AI" badge in conversation list and detail view
- [x] DashboardLayout: add AI Agents nav item
- [x] AI agent activity log UI: tab "Atividade" na página AI Agents com tabela aiAgentLogs persistida, endpoint getActivityLog por agente, stats (autoReplies, escalations, resolved, avgQualityScore, avgResponseMs)
- [x] AI vs Human performance dashboard section in TeamPerformance page (seção "AI vs Human Performance" com 4 métricas e barra de proporção)

## Phase 12: Advanced Quality Metrics (Industry Standard KPIs)
- [x] First Response Time (FRT): calculated from createdAt→firstResponseAt, displayed in ConversationDetail
- [x] Average Handle Time (AHT): calculated from createdAt→closedAt, stored as handleTimeSeconds, displayed in ConversationDetail
- [x] Average Resolution Time (ART): same as AHT, displayed separately in Productivity and TeamPerformance pages
- [x] First Contact Resolution (FCR): % conversations closed without reopening
- [x] Backlog metric: conversations open > 24h, > 48h, > 72h
- [x] SLA compliance tracker: % conversations responded within SLA window (1h default)
- [x] Quality Score breakdown: empathy, clarity, resolution, compliance (AI-scored via analyzeConversation - 4 dimensions stored in DB and displayed in ConversationDetail)
- [x] Agent leaderboard with rank and badges in TeamPerformance page
- [x] Auto-alert when agent KPI drops below threshold (low quality alerts section)
- [x] Exportable KPI report (CSV) for managers
- [x] AI vs Human performance stats (aiHandled, humanHandled, aiResolutionRate)

## Phase 13: Scale & Performance Improvements
- [x] Pagination for customer list (support 10k+ records, page/limit/offset)
- [x] Pagination for conversation list (page/limit/offset)
- [x] Search debounce (350ms) and server-side search for customers
- [x] Lazy loading for conversation messages (cursor-based, 50 msgs/page)
- [x] Database indexes created: idx_customers_email, idx_customers_phone, idx_customers_status, idx_customers_guruContactId, idx_conversations_status, idx_conversations_channel, idx_conversations_customerId, idx_conversations_assignedAgentId, idx_messages_conversationId (9 indexes total)

## Phase 14: Features do Vídeo do Líder de CS

### Painel de Novos Clientes (Guru Feed)
- [x] Página dedicada "Novos Clientes" com feed de entradas recentes da Guru
- [x] Card por cliente: nome, programa comprado, data, valor, status
- [x] Filtro por data e status
- [x] Rota /new-clients registrada no App.tsx e nav no DashboardLayout

### Agendamento de Mensagens
- [x] Tabela scheduledMessages no schema (conversationId, content, scheduledAt, status, createdBy)
- [x] Botão de agendamento no ConversationDetail (ícone de calendário)
- [x] Modal para selecionar data/hora e escrever mensagem
- [x] Endpoint scheduledMessages.create/list/cancel

### Respostas Rápidas (Quick Replies)
- [x] Tabela quickReplies no schema (title, content, shortcut, createdBy, isGlobal)
- [x] Painel de gerenciamento de respostas rápidas em Settings
- [x] Botão "Respostas Rápidas" no ConversationDetail com popup de seleção
- [x] Inserção automática do conteúdo no campo de mensagem

### Encaminhar Conversa
- [x] Botão "Encaminhar" no ConversationDetail
- [x] Modal para selecionar agente destino com lista de membros da equipe
- [x] Endpoint conversations.forward que atualiza assignedAgentId

### Sistema de Tarefas por Cliente
- [x] Tabela tasks no schema (customerId, conversationId, title, description, dueDate, status, assignedTo, priority, createdBy)
- [x] Página Tasks com lista de tarefas por cliente, filtros e criação
- [x] Rota /tasks registrada no App.tsx e nav no DashboardLayout

### Chat Interno da Equipe
- [x] Tabela internalMessages no schema (senderId, receiverId, content, isRead, createdAt)
- [x] Página TeamChat com lista de membros e conversa privada
- [x] Rota /team-chat registrada no App.tsx e nav no DashboardLayout

### Integração Reclame Aqui (via Email)
- [x] Endpoint POST /api/webhooks/email-ticket para receber e-mails
- [x] Criação automática de conversa/ticket com tag "Reclame Aqui" e canal email
- [x] Página Alerts com alertas de Reclame Aqui e Chargeback

### Alertas de Chargeback (Pagar.me)
- [x] Endpoint POST /api/webhooks/pagarme para receber eventos de chargeback
- [x] Criação automática de alerta com tag "Chargeback"
- [x] Página Alerts com cards de chargebacks e status

### Mensagens em Massa
- [x] Página Broadcasts com seleção de clientes por filtro (programa, status, tag)
- [x] Composer de mensagem com preview
- [x] Agendamento de envio e relatório de status
- [x] Rota /broadcasts registrada no App.tsx e nav no DashboardLayout

## Phase 15: Gap Fixes & Hardening (v1.6)
- [x] Fix TypeScript errors in webhooks.ts (Pagar.me + email-ticket handlers) - using $inferInsert with spread for optional customerId
- [x] Make conversations.customerId nullable in schema to support alert-only tickets without a customer
- [x] Pagar.me webhook: inserts into both conversations table (with Chargeback label) AND alerts table
- [x] Email-ticket webhook: inserts into conversations (with Reclame Aqui/Email label) AND alerts table for RA complaints
- [x] Alerts page: wired to real alerts table data via trpc.alerts.list/getStats/updateStatus
- [x] scheduledMessages.list endpoint: surfaced in ConversationDetail - shows pending scheduled messages with cancel button
- [x] Quick Replies CRUD management UI added to Settings page (create/edit/delete with shortcut support)
- [x] Tasks page: verified all CRUD endpoints (list/create/updateStatus/delete/getPendingCount) are wired correctly
- [x] TeamChat page: verified getTeamMembers/getConversation/send/markRead/getUnreadCount endpoints are wired
- [x] Broadcasts page: verified list/create/updateStatus endpoints are wired with customer filtering
- [x] NewClients page: verified date/status filters work client-side on top of customers.list query
- [x] 24 automated tests passing, TypeScript 0 errors

## Phase 16: Tradução Completa para Português do Brasil (v1.7)
- [x] DashboardLayout: menu de navegação, títulos e labels traduzidos
- [x] Home.tsx: dashboard principal com KPIs e cards traduzidos
- [x] Conversations.tsx: lista de atendimentos, filtros e modal de criação traduzidos
- [x] ConversationDetail.tsx: chat, ações, análise de IA, KPIs e timings traduzidos
- [x] Customers.tsx: lista de clientes, filtros, modal de criação e painel lateral traduzidos
- [x] Referrals.tsx: indicações e upsell, formulário e filtros traduzidos
- [x] UserManagement.tsx: gerenciamento de usuários, funções e permissões traduzidos
- [x] Settings.tsx: notificações, sobre e respostas rápidas traduzidos
- [x] TeamPerformance.tsx: métricas SLA, FCR, backlog, ranking e IA vs Humano traduzidos
- [x] Productivity.tsx: KPIs, gráficos e filtros de período traduzidos
- [x] Integrations.tsx: sincronização em massa traduzida
- [x] Surveys.tsx: pesquisas NPS/CSAT traduzidas
- [x] 24 testes automatizados passando, TypeScript 0 erros

## Phase 17: Chat Estilo WhatsApp + Melhorias vs ChatSAC (v1.8)

- [x] Emoji picker no chat (emoji-picker-react)
- [x] Gravação e envio de áudio no chat (MediaRecorder API)
- [x] Upload de imagens/documentos no chat (via S3)
- [x] Bolhas de mensagem estilo WhatsApp (fundo padrão, ✓✓ leitura, nome do agente)
- [x] Traduzir textos em inglês restantes no ConversationDetail (placeholder, botões)
- [x] Abas de fila no Conversations (Automático/Aguardando/Manual/Grupo)
- [x] Melhorar design do inbox: cards com mais informação (canal, agente, etiquetas)
- [x] Sidebar verde esmeralda com badges dinâmicos de atendimentos abertos e alertas
- [x] Modo sussurro com destaque visual melhorado
- [x] Redesign completo do ConversationDetail para layout 3 colunas estilo ChatSAC

## Phase 18: Melhorias Pós-Entrega (v1.9)

- [x] Nome do cliente nos cards de atendimento (JOIN na query conversations.list)
- [x] Notificação sonora para novos atendimentos (Web Audio API com permissão do usuário)
- [x] Executor de mensagens agendadas (endpoint /api/scheduled/send-scheduled + tarefa periódica)

## Phase 19: Controle Humano/IA + Transferência + Filtros + WhatsApp API (v2.0)

- [x] Botão "Assumir Controle" e "Devolver para IA" no ConversationDetail com persistência no banco
- [x] Indicador visual de modo (IA ativa vs Humano no controle) no header do chat
- [x] Nota automática no chat quando agente assume/devolve para IA
- [x] Transferência de atendimento entre agentes (modal com lista de agentes + notificação)
- [x] Filtro por etiqueta/tag no inbox de Atendimentos (clicar na etiqueta filtra a lista)
- [x] Integração WhatsApp Business API no executor de mensagens agendadas (channelSender.ts)

## Phase 20: Melhorias v2.1

- [x] Coluna lastError em scheduledMessages (schema + migration)
- [x] Exibir lastError na lista de mensagens agendadas no ConversationDetail
- [x] Executor de mensagens agendadas: salvar erro em lastError quando falhar
- [x] Modo de resposta rápida por atalho "/" no campo de mensagem do chat
- [x] Popup de sugestões de respostas rápidas filtrado em tempo real ao digitar "/"
- [x] Orientações de configuração WhatsApp Meta API na página de Integrações

## Phase 21: Melhorias v2.2

- [x] Botão "Tentar Novamente" para mensagens agendadas com status failed (endpoint retry + UI)
- [x] Pesquisa global no inbox de Atendimentos (nome do cliente, última mensagem, etiqueta, canal)
- [x] Dashboard de SLA em tempo real (atualiza a cada 60s, alertas visuais para SLA vencendo)

## Phase 22: Melhorias v2.3

- [x] Tabela slaSettings no schema (channel, windowMinutes, warningMinutes, isActive)
- [x] Endpoint sla.getSettings e sla.updateSettings (somente Admin)
- [x] UI de configuração de SLA por canal em Configurações (somente Admin)
- [x] slaRouter.realtime usa slaSettings do banco em vez de valores fixos
- [x] Tabela weeklyReports no schema (weekStart, weekEnd, data JSON, sentAt, createdAt)
- [x] Endpoint reports.getWeekly (lista relatórios), reports.generate (gera relatório da semana)
- [x] Página Relatórios: visualização de KPIs semanais com gráficos e tabela histórica
- [x] Envio de relatório por e-mail (via channelSender SMTP) com toggle opcional
- [x] Rota /reports registrada no App.tsx e nav no DashboardLayout
- [x] Tabela satisfactionSettings no schema (isActive, message, channels, delayMinutes)
- [x] Toggle on/off de satisfação pós-atendimento em Configurações (somente Admin)
- [x] Ao fechar conversa: enviar mensagem de satisfação se isActive=true
- [x] Registrar resposta de satisfação (👍/😐/👎) como mensagem especial na conversa
- [x] Exibir rating de satisfação no painel lateral do ConversationDetail

## Phase 23: Dashboard de Satisfação (v2.3.1)

- [x] Endpoint satisfaction.getWeeklyStats (total, great/ok/bad count e %, últimos 7 dias)
- [x] Card "Satisfação Pós-Atendimento" no Home.tsx com % ótimo/regular/ruim e barra visual

## Phase 24: Auto-resposta da IA nos webhooks (v2.4)

- [x] Bug: webhooks (WhatsApp, Instagram, Telegram, Email) não disparam autoReply quando handledByAi=true
- [x] Criar função triggerAiAutoReply(db, conversationId, messageText) reutilizável
- [x] Integrar triggerAiAutoReply em todos os webhooks de entrada de mensagem
- [x] Garantir que o envio da resposta da IA pelo canal (channelSender) também ocorre

## Phase 25: IA funcional de ponta a ponta (v2.5)

- [x] Fix: simulateIncoming deve disparar triggerAiAutoReply (hoje não dispara)
- [x] Fix: ao ativar IA numa conversa existente, enviar greetingMessage imediatamente
- [x] Página Agentes de IA: campo avatar/foto do agente (upload ou URL)
- [x] Página Agentes de IA: campo "Programa/Produto" para associar agente a produto específico
- [x] Guru webhook: ao criar cliente aprovado, criar conversa com IA ativa e enviar mensagem de boas-vindas personalizada com nome do cliente e produto
- [x] Agentes de IA: campo de mensagem de boas-vindas por produto (greetingMessage com variáveis {{nome}}, {{produto}})

## Phase 26: Diagnóstico e Configuração Padrão da IA (v2.6)

- [x] Diagnosticar por que triggerAiAutoReply não gera resposta (logs, invokeLLM, knowledgeBase)
- [x] Corrigir fluxo de auto-reply: garantir que invokeLLM é chamado corretamente e resposta é salva
- [x] Corrigir simulateIncoming para garantir que handledByAi=true antes de chamar triggerAiAutoReply
- [x] Configurar agente de IA padrão "Assistente CS" via script SQL (ativo, systemPrompt, greetingMessage)
- [x] Popular base de conhecimento padrão com 10+ entradas úteis via script SQL
- [x] Testar fluxo completo: simular mensagem → IA responde → mensagem aparece no chat

## Phase 27: Correção de Layout do Chat (v2.6.1)

- [x] Bug: mensagens da IA aparecem do lado esquerdo (igual ao cliente) — devem aparecer do lado direito (igual ao agente/empresa)
- [x] Garantir distinção visual clara: cliente=esquerda, empresa/IA/agente=direita, sistema=centro

## Phase 28: Z-API, Múltiplos Agentes, Bug Usuários, Tutorial (v2.7)

- [x] Bug: Gerenciar Usuários mostra mais de 1000 usuários fantasmas — investigar e corrigir
- [x] Integração Z-API: campos instanceId, token, clientToken no painel de Integrações (WhatsApp)
- [x] Z-API: envio de mensagem via Z-API quando canal=whatsapp e provider=zapi
- [x] Z-API: webhook de recebimento de mensagem via Z-API (/api/webhook/zapi)
- [x] Agentes de IA: gerar avatar automático (UI Avatars) baseado no nome ao criar/editar agente
- [x] Agentes de IA: suporte a múltiplos agentes ativos (cada um com canal/produto diferente)
- [x] Página Tutorial/Onboarding: guia passo a passo de configuração (Z-API, agente, KB, Guru)

## Phase 29: WhatsApp Meta Nativo + Templates (v2.8)

- [x] Remover Z-API do painel de Integrações — manter apenas Meta (API oficial)
- [x] Painel WhatsApp Meta: campos phoneNumberId, accessToken, businessAccountId, webhookVerifyToken
- [x] Webhook URL exibida automaticamente para copiar: {origin}/api/webhooks/whatsapp
- [x] Botão "Testar Conexão" que verifica se o token e phoneNumberId são válidos via API Meta
- [x] Endpoint channels.listTemplates (busca templates aprovados na Meta via businessAccountId)
- [x] Endpoint channels.sendTemplate: enviar template HSM com variáveis e registrar no chat
- [x] Endpoint channels.testConnection: validar credenciais Meta via API
- [x] Campo waBusinessAccountId adicionado no formulário de Integrações e no schema
- [x] Tutorial atualizado: remover Z-API, fluxo Meta simplificado em 4 passos

## Phase 30: Teste Geral + Correções (v2.9)

- [x] Teste end-to-end: criar cliente, criar atendimento, enviar mensagem, IA responder
- [x] Teste: fluxo Guru webhook (criar cliente automaticamente)
- [x] Teste: NPS/CSAT survey flow
- [x] Teste: agendamento de mensagem
- [x] Teste: respostas rápidas no chat
- [x] Teste: encaminhar conversa para outro agente
- [x] Teste: análise de IA numa conversa fechada
- [x] Teste: relatório semanal (gerar manualmente)
- [x] Teste: satisfação pós-atendimento (toggle + fechar conversa)
- [x] Corrigir todos os bugs críticos encontrados nos testes

## Phase 31: Monitoramento de Grupos WhatsApp (v3.0)

- [x] Tabela whatsappGroups no schema (groupId, groupName, participants, isMonitored, lastActivity)
- [x] Tabela groupMessages no schema (groupId, senderId, senderName, content, timestamp, analyzed)
- [x] Tabela groupAlerts no schema (groupId, type, message, severity, resolvedAt, createdAt)
- [x] Webhook /api/webhooks/whatsapp-group para receber mensagens de grupos via Meta/Z-API
- [x] Endpoint groups.list, groups.toggleMonitor, groups.getMessages, groups.getAlerts
- [x] Análise de IA periódica: detectar silêncio prolongado (>48h sem resposta da empresa), pedidos não respondidos, sentimento negativo
- [x] Página "Grupos" no menu lateral com lista de grupos monitorados, últimas mensagens e alertas
- [x] Alertas automáticos no sistema quando IA detectar problema num grupo
- [x] Notificação ao gestor quando alerta crítico for gerado

## Phase 32: WhatsApp Real + Templates + Grupos Auto (v3.1)

- [x] Webhook /api/webhooks/whatsapp: detectar mensagens de grupos (isGroupMsg) e salvar em groupMessages automaticamente
- [x] Webhook de grupos: criar grupo automaticamente se não existir, atualizar lastCustomerMessageAt/lastTeamMessageAt
- [x] Botão "Enviar Template" no ConversationDetail (ícone de layout/template)
- [x] Modal de seleção de template: listar templates aprovados da Meta, preview com variáveis, botão Enviar
- [x] Endpoint channels.listTemplates já existe — conectar ao modal do ConversationDetail
- [x] Tutorial: atualizar URLs de webhook com domínio publicado (reino-cs.manus.space)
- [x] Tutorial: seção "Conectar WhatsApp Real" com passo a passo completo (Meta for Developers)

## Phase 33: Reorganização do Menu Lateral (v3.2)
- [x] Reduzir menu de 19 para ~9 itens fixos + 3 grupos colapsáveis
- [x] Grupos colapsáveis: Inteligência, Equipe, Configurações (com estado persistido em localStorage)
- [x] "Novos Clientes" vira aba dentro da página Clientes
- [x] "Alertas" vira aba dentro de Campanhas
- [x] Chat Interno removido conforme solicitado pelo usuário
- [x] Menu colapsado mostra apenas ícones dos grupos sem labels

## Phase 34: Remoção do Chat Interno
- [x] Remover Chat Interno do menu lateral (DashboardLayout)
- [x] Remover rota /team-chat do App.tsx
- [x] Deletar arquivo InternalChat.tsx / TeamChat.tsx

## Phase 35: Gerenciador de Templates HSM WhatsApp
- [x] Endpoint channels.createTemplate: POST para Meta Graph API criando template com nome, categoria, idioma, corpo e variáveis
- [x] Endpoint channels.deleteTemplate: DELETE para Meta Graph API removendo template por nome
- [x] Endpoint channels.listTemplates já existe — retorna status PENDING/APPROVED/REJECTED
- [x] UI na página Integrações: seção "Templates HSM" com lista de templates e status badge
- [x] Formulário de criação: nome, categoria, idioma, corpo com variáveis, header e footer opcionais
- [x] Preview do template ao digitar
- [x] Botão deletar template (apenas REJECTED, PENDING ou PAUSED)

## Phase 36: Melhorias Estratégicas (Benchmarking vs. Mercado)
- [x] Respostas Rápidas: atalho / no campo de mensagem abre popup de busca com snippets
- [x] Contexto Rico no inbox: painel lateral no ConversationDetail com plano, MRR, data de renovação, último NPS
- [x] Filtros de status nas conversas: Todos / Aguardando / Em andamento / Resolvido / Bot com contagem
- [x] Health Score: cálculo automático 0-100 por cliente, badge colorido na lista e no perfil do cliente

## Phase 20: Glassmorphism Premium — Design Futurista (v4.2)
- [x] Coroa na sidebar reduzida para 44px com proporções elegantes, sem bolha
- [x] Título "Reino" apenas (sem "Educação")
- [x] CSS global: glass-section, glass-row, stat-card (emerald/gold/teal/amber), kpi-number, glow-xl, sombras mais dramáticas
- [x] Home.tsx: KPI cards com stat-card + acento colorido, seções com glass-section, rows com glass-row
- [x] Customers.tsx: tabs com vidro, filtros com glass, lista de clientes com hover glass, painel de detalhes com vidro premium
- [x] Conversations.tsx: header glassmorphism, search input glass, tabs glass, ConvCard com hover glass e badges glass

## Phase 21: Redesign de Paleta — Verde Luminoso Light Mode (v4.4)
- [x] Sidebar: verde médio vibrante (#0d6b4e → #1a7a5e), textos brancos com opacidade 0.90+, reflexos ciano brilhantes
- [x] Área de conteúdo: fundo light mode claro e iluminado (branco esverdeado), não mais cinza escuro
- [x] CSS global: nova paleta com verde médio como cor primária, tokens atualizados
- [x] Cards glassmorphism: fundo branco com bordas verdes translúcidas

## Phase 22: Sidebar Dupla — Dois Painéis (v4.5)
- [x] Faixa estreita de ícones (64px) sempre visível à esquerda com gradiente verde vibrante
- [x] Painel expandido flutuante à direita com nomes dos itens, gradiente verde + dourado
- [x] Avatar/coroa no topo da faixa estreita, perfil do usuário no painel expandido
- [x] Item ativo com destaque glass branco nos dois painéis
- [x] Animação suave de abertura/fechamento do painel expandido

## Phase 23: Sidebar Única Toggle (v4.6)
- [x] Sidebar única que alterna entre fechada (ícones) e aberta (ícones + nomes)
- [x] Item ativo: glass translúcido verde em ambos os modos (sem card branco)
- [x] Logo/coroa idêntico nas duas versões (mesmo tamanho e posição)
- [x] Sem dois painéis simultâneos — apenas um painel que expande/contrai

## Phase 24: Correções Sidebar (v4.7)
- [x] Coroa: usar SVG inline elegante em vez de imagem quebrada
- [x] Texto "Customer Success" mais legível (cor mais clara e contrastante)
- [x] Sidebar fechada: grupos mostram apenas 1 ícone representativo (não todos os sub-itens)
- [x] Clicar em grupo com sub-itens quando sidebar fechada: abre a sidebar automaticamente

## Phase 25: Correção de Bugs da Sidebar (v4.8)
- [x] Corrigir duplicação de sub-itens nos grupos (aparecem duas vezes)
- [x] Remover tooltip "Tarefas" que aparece na versão aberta da sidebar
- [x] Padronizar estilos hover/active em todos os botões (sem mudança de cor inesperada)
- [x] Restaurar logo da empresa (imagem) com bolha glassmorphism ao redor

## Phase 26: Duplicação Sidebar em Tarefas e Campanhas (v4.10)
- [x] Corrigir duplicação da sidebar ao navegar para /tasks e /broadcasts (também corrigido em /alerts, /groups e /new-clients)

## Phase 27: Mensagens Reais Apenas (v4.11)
- [x] Webhook Guru: só criar atendimento e enviar mensagem da IA se canal WhatsApp estiver configurado e ativo
- [x] returnToAi: só enviar greeting se canal estiver ativo
- [x] Auto-reply da IA (webhooks.ts): só enviar resposta se canal estiver ativo

## Phase 28: Passos Sugeridos v4.12
- [x] Endpoint tRPC: getChannelStatus (verificar se WhatsApp está configurado/ativo)
- [x] Endpoint tRPC: bulkDeleteConversations (deletar atendimentos sem mensagens reais em lote)
- [x] Banner de alerta no Dashboard quando WhatsApp não estiver configurado
- [x] Botão de limpeza em lote na tela de Atendimentos (remover atendimentos sem mensagem)

## Sprint 1: Plataforma Proativa (v4.13 — já concluído)
- [x] Endpoint tRPC: programDashboard (clientes por programa, health score médio, renovações próximas)
- [x] Endpoint tRPC: renewalCalendar (renovações nos próximos 7/30/60/90 dias com health score)
- [x] Endpoint tRPC: aiSupervisionQueue (ações da IA pendentes de revisão, aprovação/rejeição)
- [x] Tabela aiSupervisionQueue no schema (ação, status, aprovado/rejeitado, agentId, customerId)
- [x] Página ProgramDashboard: cards por produto com métricas separadas
- [x] Página RenewalCalendar: lista de renovações com filtros e ações recomendadas
- [x] Página AISupervision: fila do que a IA fez, com botões de aprovar/corrigir
- [x] Registrar rotas no App.tsx e sidebar
- [x] TypeScript 0 erros, checkpoint salvo

## Sprint 1: Plataforma Proativa — Visibilidade e Clareza (v4.13)
- [x] Endpoints tRPC: programDashboard.summary, programDashboard.recentEntries
- [x] Endpoints tRPC: renewalCalendar.list, renewalCalendar.stats
- [x] Tabela aiSupervisionQueue no schema e banco de dados
- [x] Endpoints tRPC: aiSupervision.list, aiSupervision.stats, aiSupervision.review, aiSupervision.create
- [x] Página ProgramDashboard: cards por produto, KPIs, entradas recentes
- [x] Página RenewalCalendar: filtros por dias, health score, recomendações IA
- [x] Página AISupervision: fila de ações da IA, aprovação/rejeição humana
- [x] Rotas registradas no App.tsx e itens na sidebar

## Sprint 2: Motor de Automação Proativa (v5.0)
- [x] Schema: tabelas playbooks, playbookSteps, customerJourney, triggerRules
- [x] Backend: endpoints tRPC playbooks CRUD, journey tracking, triggerRules CRUD
- [x] Backend: health score automático (computeHealthScore, computeAllHealthScores)
- [x] Página Playbooks: criar/editar sequências de mensagens por programa e dia
- [x] Página Gatilhos: regras configuráveis "se X então IA faz Y"
- [x] Agentes de IA: 5 agentes especializados (Sofia, Luna, Sentinel, Max, Renata) via seedDefaults
- [x] Botão "Criar Agentes Padrão" na página Agentes de IA
- [x] Registrar rotas /playbooks e /triggers no App.tsx
- [x] Grupo "Automação" na sidebar com Playbooks e Gatilhos Proativos
- [x] TypeScript 0 erros

## Sprint 3: Ligar os Elos da Automação Proativa (v6.0) — CONCLUÍDO
- [x] Seed automático: 5 agentes especializados (Sofia, Luna, Sentinel, Max, Renata) ao iniciar servidor sem agentes
- [x] Seed automático: 5 playbooks padrão com steps completos (Onboarding, Engajamento, Churn, Expansão, Renovação)
- [x] Motor de execução de playbooks: /api/scheduled/process-journeys
- [x] Motor de gatilhos automático: /api/scheduled/evaluate-triggers
- [x] Recálculo automático de health score: /api/scheduled/recalculate-health
- [x] Webhook Guru → inicia playbook customer_created automaticamente
- [x] Scheduled task: process-journeys a cada 30 minutos
- [x] Scheduled task: evaluate-triggers a cada 1 hora
- [x] Scheduled task: recalculate-health todo dia às 6h
- [x] Frontend: botão "Avaliar Agora" na tela de Gatilhos
- [x] TypeScript 0 erros, 35 testes passando, checkpoint salvo

## Sprint 3.1: Correção de Design — Playbooks e Gatilhos
- [x] Corrigir design de Playbooks.tsx (reescrito no padrão light mode do sistema)
- [x] Corrigir design de TriggerRules.tsx (reescrito no padrão light mode do sistema)
- [x] TypeScript 0 erros, checkpoint salvo

## Sprint 4: Roteamento Automático + Grupos Inteligentes (v7.0) — CONCLUÍDO
- [x] Agente "Bia" adicionado ao seed (6 agentes no total: Sofia, Luna, Sentinel, Max, Renata, Bia)
- [x] Módulo conversationRouter.ts: roteamento automático por playbook ativo, programa, tipo de conversa
- [x] Roteamento integrado no triggerAiAutoReply (webhooks.ts)
- [x] Suporte à Evolution API no channelSender.ts
- [x] Schema: campo waProvider aceita 'evolution_api'
- [x] Tela de Integrações: seletor de provider (Evolution API recomendada / Z-API / Meta)
- [x] Endpoint analyzeAllGroups no groupsRouter
- [x] Scheduled task: analyze-groups a cada 1h
- [x] Endpoint /api/scheduled/analyze-groups no webhooks.ts
- [x] Schema: campos groupType (vip|community|support) e aiAutoReply na tabela whatsappGroups
- [x] GroupMonitor: badge de tipo (VIP/Comunidade/Suporte) com ícones diferenciados
- [x] GroupMonitor: painel de configurações por grupo (tipo, IA auto-reply)
- [x] GroupMonitor: SuggestReplyDialog — gera, edita, copia e regenera sugestão de resposta
- [x] GroupMonitor: botão "Sugerir Resposta" ao lado de "Resolver" em cada alerta
- [x] Endpoint groups.suggestReply e groups.updateGroupSettings no routers.ts
- [x] TypeScript 0 erros, checkpoint salvo

## Sprint 5: Gatilhos dentro dos Agentes (v8.0)
- [x] Schema: campo agentId na tabela triggerRules (FK para aiAgents)
- [x] Migrar banco: adicionar coluna agentId + atualizar os 8 gatilhos existentes com agentes corretos
- [x] Motor de gatilhos: usar agentId do gatilho ao criar ação na fila de supervisão
- [x] Backend: endpoints triggerRules.listByAgent, triggerRules.createForAgent, triggerRules.updateForAgent, triggerRules.deleteForAgent
- [x] Refatorar AIAgents.tsx: 3 abas por agente (Perfil, Conhecimento, Quando Agir)
- [x] Aba "Quando Agir": listar, criar, editar e deletar gatilhos do agente
- [x] Transformar TriggerRules.tsx em painel de monitoramento geral (somente leitura)
- [x] TypeScript 0 erros, checkpoint salvo

## Sprint 5: Gatilhos dentro dos Agentes de IA
- [x] Adicionar campo `agentId` ao schema de `triggerRules` e migrar banco
- [x] Adicionar endpoint `triggerRules.listByAgent` no backend
- [x] Refatorar AIAgents.tsx: 4 abas (Perfil, Conhecimento, Quando Agir, Atividade)
- [x] Aba "Quando Agir": listar, criar, editar e remover gatilhos por agente
- [x] Transformar TriggerRules.tsx em painel de monitoramento somente leitura
- [x] Painel de monitoramento: gatilhos agrupados por agente com stats e botão "Avaliar Agora"

## Sprint 6: Consolidação de Agentes + Prompts Classe Mundial (v9.0)

- [x] Fundir Sofia + Bia: atualizar prompt da Sofia para incluir suporte geral (SLA, dúvidas técnicas, reembolso, reclamações)
- [x] Desativar agente Bia (isActive = false) e reatribuir gatilhos da Bia para Sofia
- [x] Enriquecer prompt da Luna: protocolo de progressão de estágio + insight proativo + plateau + handoff para Max
- [x] Enriquecer prompt do Sentinel: protocolo champion change + downgrade + documentação de churn + reativação pós-churn
- [x] Enriquecer prompt do Max: protocolo de timing perfeito + indicação + objeção de preço + pós-expansão
- [x] Enriquecer prompt da Renata: protocolo D-3 + renovação antecipada D-90 + pós-renovação + não-renovação
- [x] Adicionar gatilho Sofia: marco não atingido em 15 dias → mensagem de urgência
- [x] Adicionar gatilho Sofia: onboarding concluído → handoff para Luna
- [x] Adicionar gatilho Luna: health score ≥ 75 → handoff para Max
- [x] Adicionar gatilho Luna: plateau 14 dias → insight de funcionalidade avançada
- [x] Adicionar gatilho Sentinel: inatividade 20 dias → item de supervisão crítico
- [x] Adicionar gatilho Sentinel: health score ≤ 30 → tarefa urgente + notificação
- [x] Adicionar gatilho Max: NPS ≥ 9 → mensagem de indicação/expansão
- [x] Adicionar gatilho Renata: D-3 → lembrete final
- [x] Adicionar gatilho Renata: D-90 para clientes VIP → renovação antecipada
- [x] Checkpoint salvo

## Sprint 7: CS Ativo — Health Score Automático + Simulação de Gatilhos (v10.0)

### Health Score Automático
- [x] Criar tabela healthScoreLogs (customerId, score, breakdown JSON, calculatedAt) no schema
- [x] Implementar função calculateHealthScore(customerId) no backend com fórmula ponderada
- [x] Fórmula: inatividade (30%), NPS (25%), tickets abertos (20%), renovação próxima (15%), progresso programa (10%)
- [x] Endpoint healthScore.recalculate e healthScore.recalculateAll implementados
- [x] Cron job: recalcular health score de todos os clientes 1x por dia
- [x] Exibir breakdown do health score no painel de simulação (5 fatores com barra visual)
- [x] Histórico de health score: endpoint healthScore.getHistory implementado

### Painel de Simulação de Gatilhos
- [x] Endpoint triggerLogs.simulate: recebe customerId + ruleId, retorna resultado completo da simulação
- [x] Página /trigger-simulation com seletor de cliente e gatilho
- [x] Exibir resultado da simulação: qual agente agiria, qual mensagem enviaria, qual ação criaria
- [x] Botão "Executar de Verdade" para disparar a ação real após ver a simulação
- [x] Histórico de simulações executadas (aba Log de Disparos)

### Log de Gatilhos Disparados
- [x] Criar tabela triggerLogs (ruleId, customerId, agentId, conditionSnapshot, actionTaken, result, createdAt)
- [x] Registrar cada disparo real no triggerLogs dentro do automationEngine.ts
- [x] Endpoint triggerLogs.list com filtros por agente, cliente, isSimulation
- [x] Exibir log na aba Log de Disparos da página de simulação
- [x] Painel global de auditoria de gatilhos na página TriggerSimulation

- [x] TypeScript 0 erros, checkpoint salvo

## Sprint 8: Importador de CSV + Health Score no Perfil do Cliente (v11.0)

### Importador de CSV
- [x] Backend: endpoint POST /api/import/customers-csv (multipart/form-data, parse CSV, upsert por email)
- [x] Campos suportados no CSV: email (chave), name, phone, program, renewalDate, npsScore, lastInteractionAt, mrr, status, company
- [x] Após importação: recalcular health score automaticamente para todos os clientes atualizados
- [x] Retornar relatório: total processado, atualizados, criados, erros com linha e motivo
- [x] Frontend: página /import-csv com upload de arquivo, preview das primeiras 5 linhas, mapeamento de colunas
- [x] Frontend: resultado da importação com tabela de erros e resumo de sucesso
- [x] Template CSV para download com os campos corretos
- [x] Menu lateral: link "Importar CSV" na seção Configurações

### Health Score no Perfil do Cliente
- [x] Adicionar seção "Health Score" na página CustomerDetail com score atual + breakdown dos 5 fatores
- [x] Barra visual por fator (inatividade, NPS, tickets, renovação, progresso) com cor e valor
- [x] Botão "Recalcular" para forçar recálculo do score do cliente
- [x] Mini-gráfico de histórico do score (últimas 10 leituras do healthScoreLogs) — adiado para próxima sprint

- [x] TypeScript 0 erros, checkpoint salvo (Sprint 8)

## Sprint 9: Inteligência de Comunicação + Histórico de Health Score (v12.0)

### Motor de Análise Semântica (Backend)
- [x] Tabela communicationInsights: armazena análises (período, temas JSON, sentimento JSON, sugestões JSON, totalMessages, analyzedAt)
- [x] Função analyzeConversations(periodDays): busca mensagens do período, envia para IA, retorna análise estruturada
- [x] IA extrai: top 5 temas recorrentes, % sentimento (positivo/neutro/negativo), 3-5 sugestões acionáveis
- [x] Endpoint intelligence.analyze: dispara análise e salva resultado
- [x] Endpoint intelligence.getLatest: retorna última análise salva
- [x] Endpoint intelligence.getHistory: retorna histórico de análises (para ver evolução)
- [x] Endpoint intelligence.getTopics: retorna temas agrupados por frequência — coberto pelo getLatest
- [x] Endpoint intelligence.getSentimentTrend: retorna evolução do sentimento por semana — coberto pelo getHistory

### Painel de Inteligência de Comunicação (Frontend)
- [x] Página /communication-intelligence com layout em 3 colunas
- [x] Card de sentimento geral: donut chart (positivo/neutro/negativo)
- [x] Card de temas recorrentes: lista ranqueada com frequência e tendência (↑↓)
- [x] Card de sugestões da IA: lista de recomendações com categoria (produto/processo/comunicação)
- [x] Gráfico de evolução do sentimento ao longo do tempo (linha)
- [x] Botão "Analisar Agora" para disparar nova análise
- [x] Filtro por período (7 dias, 30 dias, 90 dias)
- [x] Menu lateral: link "Inteligência Comunicação" na seção Inteligência
- [x] Estado vazio quando não há mensagens suficientes para análise

### Histórico de Health Score por Cliente
- [x] Mini-gráfico de linha no painel de detalhes do cliente (últimas 10 leituras)
- [x] Usar recharts para o gráfico compacto
- [x] Mostrar data do primeiro e último cálculo — via eixo X do gráfico
- [x] Indicador de tendência: visível via inclinação da linha no gráfico

- [x] TypeScript 0 erros, checkpoint salvo (Sprint 9)

## Sprint 10: Job Agendado — Análise Semanal de Comunicação

- [x] Endpoint POST /api/scheduled/weekly-intelligence: roda análise de 7 dias + notifica dono
- [x] Checkpoint salvo e site publicado
- [x] Job agendado toda segunda-feira às 7h configurado

## Sprint 11: Job Diário — Recálculo Automático do Health Score

- [x] Job agendado diariamente às 3h da manhã para recalcular health score de todos os clientes

## Sprint 12: Handoff IA↔Humano + Campanhas

- [x] Schema: campo assignedTo (userId) e handoffMode (ai/human) na tabela conversations
- [x] Backend: endpoints conversations.takeOver, conversations.returnToAI
- [x] Frontend: botões "Assumir" / "Devolver para IA" na tela de conversas
- [x] Frontend: indicador visual (badge) mostrando se conversa está com IA ou humano
- [x] Backend: ao assumir, IA para de responder nessa conversa; ao devolver, IA retoma
- [x] Schema: tabela campaigns (nome, mensagem, filtros JSON, status, agentId, scheduledAt)
- [x] Backend: campaigns.create, campaigns.list, campaigns.send, campaigns.getStats
- [x] Backend: previewAudience — retorna quantos clientes serão atingidos pelos filtros
- [x] Frontend: página /campaigns enxuta com 3 filtros (health score, programa, estágio) + preview + disparo
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 12)

## Sprint 13: Preservação Automática do Histórico de Conversas

### Backend
- [x] Schema: campo `archivedAt` e `archivedReason` na tabela conversations (para marcar conversas de números inativos)
- [x] Schema: tabela `channelHistory` (customerId, channel, identifier, connectedAt, disconnectedAt, reason)
- [x] Endpoint POST /api/scheduled/backup-conversations: exporta mensagens do dia para storage S3
- [x] Endpoint POST /api/scheduled/check-whatsapp-status: verifica se canal WhatsApp está ativo, notifica dono se cair
- [x] Endpoint conversations.archiveByChannel: marca todas conversas de um número como arquivadas
- [x] Endpoint customers.getChannelHistory: retorna histórico de canais de um cliente

### Frontend
- [x] Badge "Arquivado" na lista de conversas para conversas de números inativos
- [x] Banner no topo do chat quando a conversa é de um número arquivado
- [x] Seção "Histórico de Canais" no perfil do cliente (números usados, datas, status)
- [x] Conversas arquivadas continuam visíveis na lista e no chat normalmente

### Jobs Agendados
- [x] Job diário às 2h: backup automático de todas as mensagens do dia
- [x] Job a cada 30min: verificação de status do canal WhatsApp

- [x] TypeScript 0 erros, checkpoint salvo (Sprint 13)

## Sprint 14: QR Code WhatsApp + Exportação de Histórico + Dashboard de Saúde dos Canais

### 1. Reconexão WhatsApp via QR Code
- [x] Backend: endpoint GET /api/channels/whatsapp/qr-code — gera/retorna QR Code simulado (base64 PNG) para reconexão
- [x] Backend: endpoint POST /api/channels/whatsapp/simulate-connect — simula conexão bem-sucedida (atualiza channelSettings.isActive=true)
- [x] Backend: endpoint POST /api/channels/whatsapp/simulate-disconnect — simula desconexão (atualiza channelSettings.isActive=false)
- [x] Frontend: na página Integrações, quando WhatsApp estiver desconectado, exibir botão "Reconectar via QR Code"
- [x] Frontend: modal com QR Code (imagem base64) + polling a cada 3s para verificar se conectou
- [x] Frontend: ao conectar, fechar modal e atualizar status para "Conectado"

### 2. Exportação de Histórico por Cliente (PDF/CSV)
- [x] Backend: endpoint GET /api/export/customer/:id/conversations?format=csv|pdf — gera arquivo com todas as mensagens do cliente
- [x] Backend: CSV inclui colunas: data, canal, remetente, tipo, conteúdo
- [x] Backend: PDF inclui cabeçalho com dados do cliente + tabela de mensagens agrupadas por conversa
- [x] Frontend: botão "Exportar Histórico" no painel de detalhes do cliente (ícone de download)
- [x] Frontend: dropdown com opções CSV e PDF
- [x] Frontend: toast de progresso durante geração + download automático ao concluir

### 3. Dashboard de Saúde dos Canais
- [x] Backend: endpoint tRPC channels.getHealthStatus — retorna para cada canal: isActive, lastMessageAt, messageCount24h, uptimePercent (calculado), alertas de inatividade (>24h sem mensagem)
- [x] Frontend: nova seção "Saúde dos Canais" na página de Integrações (ou nova aba)
- [x] Frontend: card por canal (WhatsApp, Email, Instagram, Telegram, Chat) com: status badge (Ativo/Inativo/Alerta), última mensagem recebida, volume 24h, uptime %
- [x] Frontend: alerta visual (âmbar) quando canal ativo não recebe mensagem há mais de 24h
- [x] Frontend: alerta vermelho quando canal está marcado como inativo

- [x] TypeScript 0 erros, checkpoint salvo (Sprint 14)

## Sprint 15: Reestruturação da Navegação (UX Simplification)

### Objetivo
Reduzir de 32 páginas/8 grupos para 5 tópicos com máximo 3 subtópicos cada.

### Nova estrutura
- Dashboard (página única)
- Clientes → Lista · Saúde & Programa · Renovações
- Atendimentos → Conversas · Tarefas · Campanhas
- IA & Automação → Supervisão & Agentes · Playbooks & Gatilhos · NPS & Pesquisas
- Configurações → Integrações · Equipe & Métricas · Ajustes

### Tarefas
- [x] Criar página unificada `/ia-automation` fundindo AIAgents, AIAnalysis, CommunicationIntelligence, AISupervision em abas
- [x] Criar página unificada `/metrics` fundindo Productivity, TeamPerformance, SLAMonitor, WeeklyReports em abas
- [x] Mover "Simular Gatilhos" para botão/aba dentro de TriggerRules (remover do menu)
- [x] Mover "Grupos WhatsApp" para aba dentro de Conversations (remover do menu)
- [x] Mover "Indicações & Upsell" para aba dentro de Customers (remover do menu)
- [x] Mover "Visão por Programa" para aba dentro de Customers (remover do menu)
- [x] Reestruturar DashboardLayout.tsx: 5 tópicos, máximo 3 subtópicos cada
- [x] Atualizar App.tsx com novas rotas unificadas
- [x] Remover itens de menu redundantes (Importar CSV e Tutorial ficam dentro de Configurações)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 15)

## Sprint 16: Simplificação 80/20

### Nova estrutura final
- Dashboard → KPIs + alertas críticos inline
- Clientes → Lista + Renovações (aba)
- Atendimentos → Conversas + Tarefas
- IA & Automação → Supervisão + Agentes + Gatilhos
- Configurações → Integrações + Usuários

### Tarefas
- [x] Sidebar: remover Campanhas, Renovações (standalone) do menu de Atendimentos
- [x] Sidebar: IA & Automação aponta direto para /ia-automation (sem submenu)
- [x] IAAutomation.tsx: simplificar para 3 abas (Supervisão · Agentes · Gatilhos)
- [x] Clientes: Renovações mantida como subtópico no menu de Clientes
- [x] Dashboard: adicionar seção de alertas críticos inline (sem página separada)
- [x] App.tsx: redirecionar /campaigns, /broadcasts, /alerts, /referrals, /groups para páginas relevantes
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 16)

## Sprint 17: Grupos WhatsApp + Visão por Programa

### Grupos WhatsApp (Atendimentos → Grupos)
- [x] Sidebar: adicionar "Grupos" como subtópico dentro de Atendimentos
- [x] Página /groups: lista de grupos com nome, membros, última mensagem, CS responsável
- [x] Clicar no grupo abre chat do grupo (igual ao chat de conversas individuais)
- [x] Chat do grupo mostra histórico de mensagens, quem enviou (CS ou cliente), data/hora
- [x] Badge de alertas por grupo na lista
- [x] Busca por nome de grupo

### Visão por Programa (Clientes → Por Programa)
- [x] Sidebar: adicionar "Por Programa" como subtópico dentro de Clientes
- [x] Página /program-dashboard: cards por programa com total de clientes, novos, em risco
- [x] Ao clicar no programa, filtra lista de clientes daquele programa
- [x] Lista mostra: nome, data de entrada, último atendimento, status (aguardando, em andamento, ok)
- [x] Indicador visual de quais clientes ainda não foram chamados (sem atendimento nos últimos X dias)
- [x] Filtro "Ver pendentes" para isolar clientes sem contato recente

- [x] TypeScript 0 erros, checkpoint salvo (Sprint 17)

## Sprint 18: Fusão Gatilhos → Agentes

- [x] IAAutomation.tsx: remover aba "Gatilhos" do nível superior
- [x] Dentro de cada Agente: aba "Quando Agir" já existia com os gatilhos do agente (sem alteração necessária)
- [x] Sidebar IA & Automação: simplificado para 2 abas (Agentes + Supervisão)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 18)

## Sprint 19: Indicadores como Tópico Principal

- [x] Sidebar: 6 tópicos — Dashboard, Clientes, Atendimentos, Indicadores, IA, Configurações
- [x] Indicadores: 3 subtópicos — Saúde dos Clientes, Desempenho do Time, NPS & Pesquisas
- [x] Criar página /indicators com abas para cada subtópico
- [x] Remover Métricas de Configurações
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 19)

## Sprint 20: Dashboard de Comando + Perfil Completo do Cliente + Protocolo de Jornada

- [x] Schema: tabela `customerJourneyTasks` (customerId, title, description, dueDate, status, phase, dayOffset, completedAt, completedBy)
- [x] Schema: tabela `customerNotes` (customerId, content, createdBy, createdAt, type: note|call|meeting|email)
- [x] Schema: campo `program` padronizado com enum dos produtos principais (Commander IA, RCC Premium, Milionário com Milhas, Assessoria Premium, Profissão Liberdade)
- [x] Schema: campo `isHighTicket` em customers para diferenciar protocolo
- [x] Backend: endpoint `journeyTasks.listByCustomer` — lista tarefas da jornada de um cliente
- [x] Backend: endpoint `journeyTasks.complete` — marca tarefa como concluída
- [x] Backend: endpoint `journeyTasks.create` — cria tarefa manual
- [x] Backend: endpoint `journeyTasks.initProtocol` — cria todas as tarefas da jornada de 12 meses para um cliente
- [x] Backend: endpoint `customerNotes.listByCustomer` — lista notas de um cliente
- [x] Backend: endpoint `customerNotes.create` — cria nota/registro de contato
- [x] Backend: endpoint `commandPanel.getActions` — retorna ações prioritárias do dia (clientes críticos, sem contato, renovações próximas) com sugestão da IA
- [x] Frontend: Dashboard de Comando — substituir KPIs genéricos por painel de ações do dia ordenadas por urgência
- [x] Frontend: cada ação mostra cliente, score, motivo da urgência, sugestão da IA, botão "Iniciar Atendimento"
- [x] Frontend: alertas vermelhos para clientes nos primeiros 7 dias sem contato
- [x] Frontend: alertas âmbar para renovações em menos de 60 dias
- [x] Frontend: Perfil do cliente — seção "Jornada do Cliente" com checklist de tarefas (collapsible)
- [x] Frontend: Perfil do cliente — seção "Notas do Time" com notas livres + registros de contato (substituindo ClickUp)
- [x] Frontend: campo para adicionar nota rápida no perfil do cliente (tipo: nota, ligação, reunião, email)
- [x] Frontend: ao clicar em cliente novo (entrada < 7 dias), iniciar protocolo de jornada automaticamente
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 20)

## Sprint 21: Protocolo Automático + Tipos de Nota + Alertas de Tarefas Vencidas

- [x] Frontend: ao clicar "Ver" em cliente novo no Dashboard, chamar `journeyTasks.initProtocol` automaticamente antes de navegar para o perfil
- [x] Frontend: seletor de tipo de nota (Nota / Ligação / Reunião / Email / WhatsApp) no formulário de adicionar nota no perfil do cliente
- [x] Backend: endpoint `journeyTasks.getOverdue` — lista tarefas vencidas (dueDate < hoje, status = pending) com dados do cliente e guardião
- [x] Backend: endpoint agendado POST `/api/scheduled/overdue-tasks` — verifica tarefas vencidas e notifica o dono com resumo (agendado dias úteis às 8h BRT)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 21)

## Sprint 22: Seed de Teste Completo (360°)

- [x] Script seed-test.mjs: 5 grupos WhatsApp (Assessoria Premium) com membros e histórico de mensagens
- [x] Script seed-test.mjs: 60 clientes em todos os cenários (novo 0-7d, ativo, em risco, renovação 60d, renovação 30d, churned, high ticket)
- [x] Script seed-test.mjs: conversas com IA e humano, mensagens realistas por canal
- [x] Script seed-test.mjs: tarefas de jornada em todos os status (pending, completed, overdue)
- [x] Script seed-test.mjs: notas de todos os tipos (nota, ligação, reunião, email, whatsapp)
- [x] Script seed-test.mjs: pesquisas NPS (promotores, passivos, detratores)
- [x] Script seed-test.mjs: alertas de chargeback e Reclame Aqui
- [x] Script seed-test.mjs: métricas de agentes e logs de atividade IA
- [x] Script cleanup-test.mjs: remove todos os dados de teste com segurança
- [x] Executar seed, validar todas as funcionalidades, documentar achados
- [x] Relatório de teste: o que está bom, o que precisa ajuste, o que falta

## Sprint 23: Correções de UX/Usabilidade (Análise 360°)

- [x] Dashboard: paginar seção "Novos Clientes — Período Crítico" (máx 5 por página com navegação anterior/próximo)
- [x] Dashboard: botão "Ver" abre painel do cliente diretamente (não navega para lista geral)
- [x] Dashboard: botão "Chat" (renovações) abre conversa interna (`/conversations?customerId=X`)
- [x] Dashboard: ao clicar em KPI card (Em Risco, Novos, Renovações), rolar automaticamente até a seção correspondente
- [x] Conversas: player de áudio inline nas mensagens (já existia, confirmado funcional)
- [x] Conversas: botão de gravação de voz com toggle Áudio/Texto — modo Texto transcreve via Whisper e insere no campo de mensagem
- [x] Clientes: painel lateral com 3 abas (Perfil / Jornada / Notas) e URL sync `?selectedId=X`
- [x] Visão por Programa: clicar em cliente abre painel diretamente (`/customers?selectedId=X`) com auto-scroll
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 23)

## Sprint 24: Atendimentos estilo WhatsApp Web

- [x] Schema: tabela `conversationTags` (id, name, color, icon, isDefault, createdBy, order)
- [x] Schema: tabela `conversationTagAssignments` (conversationId, tagId) — relação N:N
- [x] Backend: endpoints `tags.list`, `tags.create`, `tags.update`, `tags.delete`
- [x] Backend: endpoint `tags.assignToConversation` e `tags.removeFromConversation`
- [x] Backend: endpoint `tags.listUnified` — unifica conversas + grupos em uma lista, com filtro por tag
- [x] Sidebar: remover "Conversas", "Grupos" e "Tarefas" como itens separados; manter só "Atendimentos"
- [x] Sidebar: Atendimentos como item único no menu principal
- [x] Página Atendimentos: layout 2 colunas — painel esquerdo (lista) + área direita (chat aberto)
- [x] Painel esquerdo: barra de busca + lista de tags/filtros (Todos, Em Aberto, Aguardando, Automático, Grupos)
- [x] Painel esquerdo: cada item da lista mostra avatar, nome, última mensagem, hora
- [x] Painel esquerdo: grupos aparecem na mesma lista com ícone diferenciado
- [x] Painel esquerdo: filtro por tag (incluindo tags de guardião)
- [x] Gerenciamento de tags: modal para criar/editar/excluir tags com nome, cor e ícone
- [x] Área direita: ao clicar num chat, abre o chat inline sem sair da página (painel esquerdo permanece visível)
- [x] Sidebar principal: Atendimentos ocupa tela completa com layout 2 colunas
- [x] Tarefas: aba "Tarefas" adicionada ao painel do cliente (4ª aba) com CRUD completo
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 24)

## Sprint 25: Restaurar painel completo de atendimento no Atendimentos

- [x] Atendimentos: cabeçalho do chat mostra nome, produto, health score e status do cliente
- [x] Atendimentos: botão "Assumir Conversa" (tirar do modo IA e assumir controle humano)
- [x] Atendimentos: botão "Registrar Nota" rápido no cabeçalho do chat
- [x] Atendimentos: envio de áudio com gravação de voz (botão microfone)
- [x] Atendimentos: atalhos de IA (sugestão de resposta, resumo da conversa)
- [x] Atendimentos: respostas rápidas acessíveis no campo de mensagem
- [x] Atendimentos: agendamento de mensagem no chat
- [x] Atendimentos: encaminhar conversa para outro agente
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 25)

## Sprint 26: Sidebar limpa + navegação estilo Airbnb

- [x] Sidebar: remover todos os sub-itens expansíveis; manter apenas 7 itens principais (Dashboard, Clientes, Atendimentos, Indicadores, IA & Automação, Configurações + perfil)
- [x] Sidebar: espaçamento compacto entre itens (igual referência — sem gap excessivo)
- [x] Sidebar: remover chevron/seta de expansão dos itens
- [x] Clientes: barra de subtópicos Airbnb no topo (Lista de Clientes · Por Programa · Renovações)
- [x] Indicadores: barra de subtópicos Airbnb no topo (Saúde dos Clientes · Desempenho do Time · NPS & Pesquisas)
- [x] IA & Automação: barra de subtópicos Airbnb no topo (Agentes · Supervisão)
- [x] Configurações: barra de subtópicos Airbnb no topo (Usuários · Integrações)
- [x] Componente reutilizável `SubTabBar` para a barra de subtópicos (ícone + label + underline ativo)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 26)

## Sprint 27: QA Audit & Correções

- [x] Bug B2: Botão de chat em Clientes abria /conversations (página antiga) — corrigido para /atendimentos
- [x] Bug B3: Ao chegar em Atendimentos via botão de chat, conversa não era selecionada automaticamente — corrigido com useEffect + urlCustomerId
- [x] Bug B4: Texto "açãoões" no Dashboard — corrigido para "ações" com lógica condicional correta
- [x] Bug B5: Clientes com score 0/null apareciam na lista "Precisam de Atenção" — corrigido para filtrar apenas clientes com score calculado (>0)
- [x] Bug B6: Conversas "? Desconhecido" sem vinculação a cliente — vinculação automática por telefone (implementado no Sprint 30)
- [x] Bug B7/B8: Métricas de IA (Atendidos/Escaladas) estáticas — conectar a dados reais (implementado no Sprint 29)
- [x] Sprint 27: Base de Conhecimento Viva — capturar perguntas recorrentes e transformar em FAQ (implementado)
- [x] Sprint 28: Fila de Prioridade Inteligente no Dashboard — lista única ordenada por urgência (implementado)
- [x] Sprint 29: Supervisão Real da IA — logs de ações, métricas reais, feed de aprendizados (implementado)
- [x] Sprint 30: Vinculação automática de conversas desconhecidas por telefone (implementado)
- [x] Sprint 31: NPS automatizado com análise de sentimento pelo LLM (implementado)
- [x] Sprint 32: Automação completa da régua de renovações (4 etapas) (implementado)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 27)

## Sprint 27b: Base de Conhecimento Viva

- [x] Schema: tabela `knowledgeCaptures` (id, question, normalizedQuestion, category, frequency, lastSeenAt, status: pending/approved/dismissed, resolution, sourceConversationIds)
- [x] Schema: tabela `knowledgeFAQ` (id, question, answer, category, agentIds, createdAt, updatedAt)
- [x] Server: procedure `knowledge.listCaptures` (filtro por categoria, status, ordenado por frequência)
- [x] Server: procedure `knowledge.approveCapture` (mover para FAQ + adicionar à KB dos agentes selecionados)
- [x] Server: procedure `knowledge.dismissCapture`
- [x] Server: procedure `knowledge.listFAQ`
- [x] Server: procedure `knowledge.createFAQ` / `updateFAQ` / `deleteFAQ`
- [x] LLM: ao receber mensagem de cliente, classificar se é uma dúvida recorrente e salvar em knowledgeCaptures
- [x] UI: aba "Base de Conhecimento" dentro de IA & Automação (SubTabBar)
- [x] UI: painel "Perguntas Capturadas" — lista com frequência, categoria, botões Aprovar/Dispensar
- [x] UI: painel "FAQ" — lista de respostas aprovadas com edição inline
- [x] UI: ao aprovar, modal para selecionar quais agentes recebem o item na KB
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 27b)

## Sprint 28: Fila de Prioridade Inteligente + Grupos WhatsApp

- [x] Server: procedure `commandPanel.getPriorityQueue` — score de urgência por cliente (risco + dias sem contato + renovação próxima)
- [x] Dashboard: substituir os 4 blocos separados por uma única "Fila de Prioridade" ordenada por score, com badge de motivo
- [x] Dashboard: ring de urgência visual (SVG) com score colorido por criticidade + botões Chat/Ver por item
- [x] Dashboard: filtros de categoria (Todos / Em Risco / Novo Cliente / Renovação / Sem Contato)
- [x] Atendimentos: UI de grupo adaptada — banner IA/Humano, toggle IA por grupo, nome do remetente em cada mensagem
- [x] Atendimentos: badge de grupo, tipo VIP/Community, contagem de participantes
- [x] Atendimentos: quando humano envia mensagem no grupo, IA pode ser desativada com um clique
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 28)

## Sprint 29: Tela de Cliente Redesenhada + Fix "Ver" no Dashboard

- [x] Fix: botão "Ver" no Dashboard abre /customers?selectedId=X e painel abre automaticamente
- [x] CustomerDetail: aba "Jornada" redesenhada com seletor de fase (Onboarding / Acompanhamento / Renovação)
- [x] CustomerDetail: barra de progresso visual por fase com % concluído
- [x] CustomerDetail: banner "Próxima ação sugerida pela IA" com botões Abrir Chat + Marcar Feito
- [x] CustomerDetail: botão "Iniciar Protocolo de Jornada" quando não há tarefas
- [x] CustomerDetail: tarefas pendentes com botões Concluir/Pular, tarefas feitas com tachado
- [x] CustomerDetail: componente reutilizável JourneyTab.tsx
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 29)

## Sprint 30: Régua de Sucesso Automatizada (Engine de Cadência)

- [x] Schema: tabelas `cadenceRules` e `cadenceExecutions` criadas no banco
- [x] Server: procedure `cadence.listRules` / `createRule` / `updateRule` / `deleteRule`
- [x] Server: procedure `cadence.runEngine` — executa todas as regras ativas para todos os clientes elegíveis
- [x] Server: procedure `cadence.listExecutions` e `getTodaySummary`
- [x] Engine: LLM personaliza cada mensagem com variáveis {{name}}, {{program}}, {{healthScore}}, etc.
- [x] Engine: suporte a ações: send_whatsapp, create_task, update_health_score, notify_agent
- [x] Engine: deduplication por `executionFrequency` (once = não repete para o mesmo cliente)
- [x] UI: aba "Automações" dentro de IA & Automação (SubTabBar)
- [x] UI: lista de regras com toggle ativo/inativo, botão deletar, badge de frequência
- [x] UI: modal de criação de regra com todos os campos (trigger, valor, ação, template, programa alvo)
- [x] UI: log de execuções com status (sent/failed/skipped), mensagem gerada, timestamp
- [x] UI: botão "Executar Agora" para teste manual do engine
- [x] UI: resumo do dia (enviadas / falhas / puladas)
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 30)

## Sprint 31: Bug Fix — "Ver" no Dashboard

- [x] Fix: botão "Ver" no Dashboard agora busca o cliente por ID diretamente (getById query) e abre o painel automaticamente, independente da paginação

## Sprint 32: Transcrição de Reuniões + Melhorias na Tela de Clientes

### Transcrição de Reuniões (Upload de PDF/Texto)
- [x] Schema: tabela `meetingTranscripts` criada no banco
- [x] Server: procedure `transcripts.upload` — salva no banco, analisa com LLM em segundo plano
- [x] Server: LLM analisa transcrição: gera resumo, pontos-chave, itens de ação, ajusta health score, captura dúvidas para Base de Conhecimento
- [x] Server: procedure `transcripts.list` e `transcripts.delete`
- [x] UI: aba "Reuniões" no painel lateral do cliente (CustomerDetail)
- [x] UI: botão "Enviar Transcrição" com suporte a texto colado ou arquivo .txt
- [x] UI: card de cada transcrição com resumo, pontos-chave, itens de ação e delta de health score
- [x] UI: indicador visual de impacto no health score (+X ou -X) com ícone TrendingUp/Down

### Melhorias na Lista de Clientes
- [x] Lista de clientes: coluna "Dias no Programa" com tooltip mostrando data de entrada
- [x] Lista de clientes: mostrar múltiplos produtos (suporte a array de programas) — implementado como badges separados por vírgula
- [x] Substituir "Histórico de Canais" por "Últimas Interações" — implementado com últimas 5 conversas do cliente

### Health Score Automático
- [x] Ao fechar conversa: LLM analisa sentimento e atualiza health score automaticamente (+/-10 pontos)

### Dashboard — Clareza do Score de Urgência
- [x] Score de urgência com tooltip explicando a fórmula (hover no anel)
- [x] Health Score e Último Contato visíveis em cada card da Fila de Prioridade

### Notificação de Jornada
- [x] Quando tarefa da jornada vence sem ser concluída: criar notificação para o agente responsável — implementado via botão "Verificar Vencidas" na página de Tarefas
- [x] TypeScript 0 erros, checkpoint salvo (Sprint 32)

## Phase 26: Bug Fix — Nome do Cliente no Prompt da IA (v2.6)

- [x] Bug: IA usa "[Nome do Cliente]" literal em vez do nome real — corrigir prompt do sistema para injetar o nome dinamicamente
## Phase 27: Evolution API Integration (WhatsApp sem API Oficial)
- [x] Webhook handler POST /api/webhooks/evolution — recebe mensagens do Evolution API (Baileys/QR Code)
- [x] Bug fix: IA usa nome real do cliente em vez de "[Nome do Cliente]" placeholder
- [x] Configurar na plataforma: URL do Evolution API + API Key após instalar no EC2 (configuração externa)
- [x] Criar instâncias: milhanario, profissao_liberdade (configuração externa)
- [x] Escanear QR Code para conectar os números sem API (configuração externa)

## Phase 28: QR Code na Tela de Integrações (Evolution API)
- [x] Endpoint tRPC evolutionQrCode.getQrCode — busca QR Code da Evolution API e retorna base64
- [x] Endpoint tRPC evolutionQrCode.getStatus — verifica status de conexão da instância
- [x] Endpoint tRPC evolutionQrCode.createInstance — cria instância se não existir
- [x] UI na página Integrações: botão "Conectar via QR Code", exibe QR Code com polling automático de status
- [x] Polling a cada 3s enquanto QR Code estiver visível, para detectar quando o celular escanear
- [x] Ao conectar: exibir badge "Conectado ✓" e parar o polling

## Phase 29: Hub do Cliente — Melhorias de Fluxo
- [x] Botão "Ver Perfil Completo" no painel direito do chat (ConversationDetail) — abre /customers?id=X
- [x] Seção Vitórias/Desafios/Marcos no perfil do cliente (nova aba ou seção em Notas)
- [x] Mini-jornada no painel lateral do chat — mostra tarefas pendentes da jornada do cliente

## Phase 30: Limpeza de Dados Fake + Correção IA & Automação
- [x] Remover todos os clientes fake/teste do banco (manter apenas dados reais do Guru)
- [x] Remover todas as conversas/mensagens de teste (os 26 atendimentos fake)
- [x] Remover tarefas, notas e outros registros de teste associados
- [x] Investigar e corrigir bug na seção Base de Conhecimento (IA & Automação)
- [x] Investigar e corrigir bug na seção Automações (IA & Automação)
- [x] Investigar e corrigir bug na seção Supervisão IA (IA & Automação)
- [x] Verificar integração Digital Manager Guru e confirmar dados reais sincronizados

## Phase 31: Limpeza Total — Zero Dados Fake
- [x] Auditar todas as tabelas: conversas, mensagens, tarefas, notas, alertas, broadcasts, agendamentos
- [x] Deletar TODAS as conversas que não vieram de canais reais (WhatsApp/Email/Instagram real)
- [x] Deletar mensagens órfãs (sem conversa pai válida)
- [x] Deletar tarefas, notas, alertas e outros registros associados a dados fake
- [x] Corrigir badge "20" em Atendimentos — deve mostrar 0 se não há conversas reais com mensagens não lidas
- [x] Verificar Fila de Prioridade: apenas clientes reais do Guru (guruContactId não nulo)
- [x] Verificar contadores do Dashboard: Em Risco, Novos, Renovações, Total — todos baseados em dados reais

## Phase 32: Simplificação do Perfil do Cliente
- [x] Adicionar campo purchaseDate (data de compra) e purchaseAmount (valor pago) no schema/customers
- [x] Puxar purchaseDate e purchaseAmount dos guru_webhook_events (type=purchase) para cada cliente
- [x] Exibir data de compra e valor pago no card de perfil (aba Perfil)
- [x] Mesclar abas Jornada + Tarefas em uma única aba "Jornada & Tarefas"
- [x] Mesclar abas Notas + Marcos em uma única aba "Notas & Marcos"
- [x] Resultado final: 4 abas no perfil — Perfil, Jornada & Tarefas, Notas & Marcos, Reuniões

## Phase 33: Remover Dados Fictícios — Grupos e Outros
- [x] Identificar onde "grupos" aparecem na UI (sidebar, perfil do cliente, filtros)
- [x] Verificar banco de dados: tabela de grupos/setores tem dados fake?
- [x] Remover ou ocultar grupos que não existem na realidade
- [x] Verificar outros campos fictícios (status, tags, programas) e limpar

## Phase 34: Dashboard de Tarefas do Time (ClickUp Replacement)
- [x] Nova página "Tarefas" no menu lateral com visão geral de todas as tarefas
- [x] Filtros por equipe (IPL, MCM, RCC), por responsável, por status, por prazo
- [x] Kanban ou lista de tarefas com colunas: A Fazer, Em Andamento, Concluído
- [x] Contador de tarefas por equipe no topo
- [x] Indicador visual de tarefas atrasadas (prazo vencido)

## Phase 35: Anexos em Tarefas (Prints de Contrato/Reunião/Grupos)
- [x] Adicionar tabela taskAttachments no schema (taskId, fileName, fileUrl, fileKey, uploadedAt, type)
- [x] Endpoint tRPC: uploadTaskAttachment, getTaskAttachments, deleteTaskAttachment
- [x] UI: botão "Anexar" em cada tarefa — abre modal com upload de arquivo
- [x] Exibir lista de anexos com ícone de tipo (imagem, PDF) e botão de download
- [x] Suporte a tipos: print de reunião, print de contrato, print de grupo, outros

## Phase 36: ROI / Retorno por Cliente
- [x] Adicionar tabela clientROI no schema (customerId, saleDescription, saleValue, profitValue, goalValue, goalProgress, saleDate)
- [x] Endpoint tRPC: createROIEntry, listROIEntries, updateROIEntry, deleteROIEntry
- [x] UI: nova seção "ROI & Metas" na aba Perfil do cliente
- [x] Mostrar: total investido, total de retorno, % de meta atingida, lista de vendas/entregas

## Phase 37: Formulário de Solicitação (Form Builder → Cria Tarefa)
- [x] Nova página "Formulários" no menu lateral
- [x] Criar formulário com campos customizáveis (texto, data, seleção, número)
- [x] Formulário de exemplo: "Solicitação de Passagem" com campos relevantes
- [x] Ao submeter formulário: criar tarefa automaticamente com os dados preenchidos
- [x] Link público do formulário para enviar ao cliente/solicitante

## Phase 38: Google Calendar Integration
- [x] Botão "Adicionar ao Google Agenda" em reuniões e tarefas com data
- [x] Gerar link de evento do Google Calendar com título, data, descrição e link de reunião
- [x] Exibir badge "No Calendário" após adicionar

## Phase 39: Redesign Completo da Sidebar (Sprint 34)
- [x] Substituir sidebar plana por 3 módulos expansíveis: Atendimento, CRM, Estatísticas
- [x] Módulo Atendimento: Caixa de Entrada, Conversas, Canais (WhatsApp/Instagram/etc), Filas, Equipes, Atendentes, Etiquetas, Respostas Rápidas, Campanhas, Chatbots, Fluxos, Histórico, Tarefas
- [x] Módulo CRM: Clientes, Carteiras, Leads, Empresas, Negócios, Pipeline, Funil, Oportunidades, Agenda, Follow-ups, Tarefas Comerciais, Formulários, Histórico, Documentos, Anotações, Timeline
- [x] Módulo Estatísticas: Dashboard, Indicadores, Relatórios, Metas, Performance, SLA, Produtividade, TMA, Conversões, Receita, Auditoria, Logs, Exportações
- [x] Configurações separada no final com submenus: Usuários, Permissões, Canais, Integrações, API, Webhooks, IA, Automações, Financeiro, Assinatura, Preferências
- [x] Ícones minimalistas, menus expansíveis com animação suave, hover moderno, indicador visual do módulo ativo
- [x] Header mais limpo: menos elementos, melhor alinhamento, botões principais destacados
- [x] Cards com mais respiro, cantos arredondados, sombras discretas, melhor hierarquia tipográfica
- [x] Cores: verde apenas para ações importantes, fundo neutro, menos degradê, melhor contraste

## Phase 40: Reorganização Completa do Módulo de Atendimento
- [x] Renomear "Reino Customer Success" → "Reino Sucesso do Cliente" em todo o sistema
- [x] Reestruturar sidebar: Atendimento com 5 sub-módulos (WhatsApp, E-mail, Redes Sociais, Bots, Em Breve)
- [x] Sub-módulo Bots: Chatbots, Fluxos, Mensagens Automáticas, Agendamento, IA, Base de Conhecimento, Treinamento, Modelos, Webhooks
- [x] Sub-módulo Em Breve: 30+ itens futuros com badge "em desenvolvimento"
- [x] Melhorar UX do inbox WhatsApp: filtro por agente, indicador de tempo ANS nos cards
