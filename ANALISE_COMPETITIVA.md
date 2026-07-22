# Análise Competitiva — Sistema CS vs. Mercado

## O que as melhores plataformas têm em comum

Após pesquisar Intercom, Gainsight, Planhat, ChurnZero, Zendesk, Freshdesk e Totango, os padrões que se repetem nas líderes são:

### 1. Visão 360° do Cliente
Todas as plataformas top têm um perfil unificado do cliente com: histórico de conversas, tickets, NPS, uso do produto, valor pago, data de renovação, tags e notas da equipe — tudo em uma única tela.

### 2. Health Score (Nota de Saúde)
O coração de qualquer plataforma CS séria. Um número de 0–100 calculado automaticamente com base em: engajamento, tempo de resposta, NPS, inadimplência, atividade recente. Ativa alertas automáticos quando cai.

### 3. Playbooks Automatizados
Sequências de ações disparadas por eventos: "cliente não responde há 7 dias → enviar mensagem de check-in → se não responder em 3 dias → criar tarefa para o CSM ligar". Gainsight e ChurnZero são referência nisso.

### 4. Timeline de Ciclo de Vida
Linha do tempo visual mostrando cada marco do cliente: onboarding, primeira renovação, upsell, NPS enviado, reclamação resolvida. Planhat é referência.

### 5. Inbox Unificado com Contexto Rico
Intercom e Zendesk mostram na conversa: nome, empresa, plano, valor, histórico de tickets anteriores, NPS mais recente — sem precisar abrir outra aba.

### 6. Automação de Renovação
Calendário de renovações, alertas X dias antes do vencimento, fluxo automatizado de proposta de renovação. ChurnZero tem o "Renewal Center".

### 7. Segmentação Dinâmica de Clientes
Filtros salvos: "clientes com NPS < 7 + renovação em 30 dias + sem contato há 14 dias" → lista de ação imediata.

### 8. Portal do Cliente (Self-Service)
Área onde o cliente vê seu progresso, acessa materiais, responde NPS, abre tickets. Planhat e Gainsight têm isso.

### 9. Respostas Rápidas / Snippets
Biblioteca de respostas prontas com variáveis (nome, empresa) que o atendente insere com um atalho. Zendesk e Intercom têm isso.

### 10. Relatórios de Impacto de CS
Métricas como: Net Revenue Retention (NRR), Churn Rate, Expansion Revenue, Time to First Response, CSAT por atendente.

---

## O que nosso sistema já tem ✅

| Funcionalidade | Status |
|---|---|
| Atendimentos via WhatsApp (Meta Cloud API) | ✅ Implementado |
| Agentes de IA com auto-resposta | ✅ Implementado |
| NPS & CSAT (envio e coleta) | ✅ Implementado |
| Indicações & Upsell | ✅ Implementado |
| Alertas de silêncio e sentimento negativo | ✅ Implementado |
| Monitor de SLA | ✅ Implementado |
| Análise de IA das conversas | ✅ Implementado |
| Grupos WhatsApp | ✅ Implementado |
| Templates HSM (criar e enviar) | ✅ Implementado |
| Campanhas em massa | ✅ Implementado |
| Tarefas | ✅ Implementado |
| Relatórios Semanais | ✅ Implementado |
| Produtividade da equipe | ✅ Implementado |
| Desempenho da equipe | ✅ Implementado |

## O que ainda falta (Gaps vs. mercado) ❌

| Funcionalidade | Impacto | Complexidade |
|---|---|---|
| **Health Score automático** | 🔴 Alto | Média |
| **Visão 360° do cliente** (tela unificada) | 🔴 Alto | Média |
| **Respostas rápidas / Snippets** | 🔴 Alto | Baixa |
| **Timeline de ciclo de vida** | 🟡 Médio | Média |
| **Calendário de renovações** | 🔴 Alto | Baixa |
| **Segmentação dinâmica** (filtros salvos) | 🟡 Médio | Média |
| **Contexto rico no inbox** (plano, valor, NPS) | 🔴 Alto | Baixa |
| **Playbooks automatizados** | 🟡 Médio | Alta |
| **Portal do cliente** | 🟢 Baixo | Alta |
| **Relatórios NRR/Churn** | 🟡 Médio | Média |

---

## Roadmap Sugerido (por prioridade)

### 🔴 Prioridade Alta — Impacto imediato em renovação e atendimento

1. **Respostas Rápidas** — Biblioteca de snippets no ConversationDetail. Atalho `/` para buscar e inserir. Baixa complexidade, alto uso diário.

2. **Health Score** — Nota 0–100 por cliente calculada com: dias sem resposta, NPS, inadimplência, frequência de contato. Aparece no card do cliente e no dashboard.

3. **Contexto rico no inbox** — Painel lateral no ConversationDetail mostrando: plano, valor MRR, data de renovação, último NPS, histórico de atendimentos.

4. **Calendário de Renovações** — Visão de calendário/lista com clientes com renovação nos próximos 30/60/90 dias + status (em risco, ok, renovado).

### 🟡 Prioridade Média — Diferencial competitivo

5. **Segmentação Dinâmica** — Filtros combinados na tela de Clientes: NPS + renovação + último contato + health score. Salvar como "lista de ação".

6. **Timeline do Cliente** — Linha do tempo em cada perfil: onboarding, NPS enviado, renovações, upsells, reclamações.

7. **Relatórios de Retenção** — Dashboard com NRR, Churn Rate, Expansion Revenue, CSAT médio por período.

### 🟢 Prioridade Baixa — Longo prazo

8. **Playbooks Automatizados** — Sequências de ações por gatilho (health score cai, renovação se aproxima, NPS < 7).

9. **Portal do Cliente** — Área self-service onde o cliente vê seu progresso e acessa materiais.

---

## Análise de Design vs. ChatSAC

Olhando a screenshot do ChatSAC:
- Menu lateral denso, sem hierarquia clara
- Lista de conversas com tags coloridas (APM, Carteira Cintia) — boa ideia para segmentar
- Filtros por status (Automático, Aguardando, Fora de hora, Manual, Grupo) — muito útil
- Interface escura com boa densidade de informação

**O que podemos fazer melhor:**
- **Filtros de status na lista de conversas** — nosso sistema não tem isso ainda
- **Tags coloridas nos clientes** — para identificar segmento/carteira rapidamente
- **Indicador de tempo de espera** na lista de conversas
- **Painel lateral de contexto** ao abrir uma conversa (o ChatSAC não tem isso)
- **Health Score visível** na lista — diferencial que o ChatSAC não tem
