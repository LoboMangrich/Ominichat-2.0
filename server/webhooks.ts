import { Express, Request, Response } from "express";
import { getDb } from "./db";
import { registerCsvImport } from "./csvImport";
import { storagePut } from "./storage";
import { customers, conversations, guruWebhookEvents, guruSettings, alerts, scheduledMessages, messages, aiAgents, knowledgeBase, whatsappGroups, groupMessages, channelSettings } from "../drizzle/schema";
import { sendMessageByConversation } from "./channelSender";
import { eq, or, lte, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { startJourneyForCustomer } from "./playbookEngine";
import { routeConversationToAgent } from "./conversationRouter";

/**
 * Trigger AI auto-reply for a conversation if it is handled by AI.
 * Finds the active AI agent, generates a reply using LLM + knowledge base,
 * saves it as an AI message, and sends it back via the channel.
 */
async function triggerAiAutoReply(conversationId: number, customerMessage: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    // Auto-route to the correct agent if not yet assigned (roteamento automático)
    await routeConversationToAgent(conversationId);
    // Only proceed if conversation is handled by AI
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!conv || !conv.handledByAi) return;
    // Fetch customer name for personalisation
    let customerFirstName = "";
    if (conv.customerId) {
      const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, conv.customerId)).limit(1);
      if (cust?.name) customerFirstName = cust.name.split(" ")[0];
    }
    // Find assigned agent or any active agent
    let agentId = conv.aiAgentId;
    if (!agentId) {
      const agents = await db.select().from(aiAgents).where(eq(aiAgents.isActive, true)).limit(1);
      if (!agents.length) return;
      agentId = agents[0].id;
    }
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, agentId)).limit(1);
    if (!agent || !agent.isActive) return;
    // Build knowledge base context
    const kb = await db.select().from(knowledgeBase)
      .where(and(eq(knowledgeBase.agentId, agentId), eq(knowledgeBase.isActive, true)))
      .limit(20);
    const kbContext = kb.map(e => `Q: ${e.title}\nA: ${e.content}`).join("\n\n");
    // Build recent conversation history
    const history = await db.select().from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.isInternal, false)))
      .orderBy(desc(messages.createdAt)).limit(10);
    const historyText = history.reverse().map(m =>
      `${m.senderType === "customer" ? "Cliente" : "Agente"}: ${m.content}`
    ).join("\n");
    const basePrompt = agent.systemPrompt ||
      `Você é um assistente de suporte ao cliente profissional e empático. Responda de forma clara, objetiva e cordial. Se não souber a resposta, informe que um agente humano entrará em contato em breve.`;
    // Inject customer name so the AI never outputs a literal placeholder
    const customerCtx = customerFirstName
      ? `\n\nNome do cliente nesta conversa: ${customerFirstName}. Use o nome real ao se dirigir ao cliente — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`
      : `\n\nUse o nome do cliente caso ele apareça no histórico — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`;
    const systemPrompt = basePrompt + customerCtx;
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nBase de conhecimento:\n${kbContext || "Nenhuma entrada disponível."}\n\nHistórico recente:\n${historyText}`,
        },
        { role: "user", content: customerMessage },
      ],
    });
    const aiReply = (response.choices[0]?.message?.content as string) ?? "Desculpe, não consegui processar sua mensagem.";
    // Ensure conversation is marked as handled by this agent
    await db.update(conversations)
      .set({ handledByAi: true, aiAgentId: agentId, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    // Only send and record if the channel is active and configured
    const sendResult = await sendMessageByConversation({ conversationId, content: aiReply });
    if (sendResult.success) {
      await db.insert(messages).values({
        conversationId,
        senderType: "ai",
        content: aiReply,
        senderId: null,
      });
      console.log(`[AI AutoReply] Conv ${conversationId} replied by agent "${agent.name}"`);
    } else {
      console.warn(`[AI AutoReply] Channel send failed for conv ${conversationId}: ${sendResult.error} — message NOT recorded`);
    }
  } catch (err) {
    console.error(`[AI AutoReply] Error for conv ${conversationId}:`, err);
  }
}

/**
 * Cria (ou reaproveita) o cliente, abre uma conversa de e-mail e grava a mensagem.
 * Usada tanto pelo webhook /api/webhooks/email-ticket (encaminhador externo) quanto
 * pelo leitor IMAP da Titan — as duas entradas de e-mail passam por aqui.
 */
async function ingestInboundEmail(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: { fromEmail: string; fromName: string; subject: string; body: string; rawPayload?: unknown; source?: string }
): Promise<{ conversationId: number; isReclameAqui: boolean }> {
  const subject = input.subject || "Sem assunto";
  const fromEmail = input.fromEmail || "";
  const fromName = input.fromName || fromEmail;
  const body = input.body || "";

  const isReclameAqui = subject.toLowerCase().includes("reclame aqui") ||
    fromEmail.toLowerCase().includes("reclameaqui") ||
    body.toLowerCase().includes("reclame aqui") ||
    input.source === "reclame_aqui";

  // Encontra ou cria o cliente pelo e-mail
  let customerId: number | null = null;
  if (fromEmail) {
    const existing = await db.select().from(customers).where(eq(customers.email, fromEmail)).limit(1);
    if (existing.length) {
      customerId = existing[0].id;
    } else {
      const [nc] = await db.insert(customers).values({
        name: fromName || fromEmail,
        email: fromEmail,
        status: "New",
      }).$returningId();
      customerId = nc.id;
    }
  }

  const { messages: messagesTable, conversationLabels } = await import("../drizzle/schema");
  const emailConvInsert: typeof conversations.$inferInsert = {
    channel: "email",
    status: "Open",
    subject: subject.substring(0, 255),
    ...(customerId !== null ? { customerId } : {}),
  };
  const [newConv] = await db.insert(conversations).values(emailConvInsert).$returningId();

  const label = isReclameAqui ? "Reclame Aqui" : "Email";
  const color = isReclameAqui ? "#f97316" : "#3b82f6";
  await db.insert(conversationLabels).values({
    conversationId: newConv.id,
    label,
    color,
    createdBy: 0,
  });

  const cleanBody = typeof body === "string" ? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : String(body);
  await db.insert(messagesTable).values({
    conversationId: newConv.id,
    senderType: "customer",
    content: cleanBody.substring(0, 5000) || subject,
  });
  triggerAiAutoReply(newConv.id, cleanBody.substring(0, 5000) || subject).catch(() => {});

  if (isReclameAqui) {
    const existingCustomer = customerId ? await db.select().from(customers).where(eq(customers.id, customerId)).limit(1) : [];
    await db.insert(alerts).values({
      type: "reclame_aqui",
      title: subject.substring(0, 255),
      description: cleanBody.substring(0, 500),
      customerId: customerId || undefined,
      customerName: existingCustomer[0]?.name || fromName || fromEmail,
      customerEmail: fromEmail || undefined,
      status: "open",
      rawPayload: input.rawPayload ?? { source: input.source },
    });
    console.log(`[Email] Reclame Aqui ticket criado de ${fromEmail}: ${subject}`);
  } else {
    console.log(`[Email] Ticket criado de ${fromEmail}: ${subject}`);
  }

  return { conversationId: newConv.id, isReclameAqui };
}

/**
 * Leitor IMAP da Titan (imap.titan.email:993). Busca mensagens não lidas na INBOX,
 * cria um ticket para cada uma e as marca como lidas. Chamado pelo endpoint
 * /api/scheduled/poll-email (scheduler externo, ex.: a cada 2-5 min).
 *
 * imapflow e mailparser são carregados dinamicamente — precisam estar instalados.
 */
async function pollTitanInbox(): Promise<{ ok: boolean; processed: number; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, processed: 0, error: "DB indisponível" };

  const [s] = await db.select().from(channelSettings).where(eq(channelSettings.channel, "email")).limit(1);
  if (!s || !s.isActive) return { ok: false, processed: 0, error: "Canal de e-mail não configurado/ativo" };
  const host = s.emailImapHost || "imap.titan.email";
  const port = s.emailImapPort || 993;
  if (!s.emailUser || !s.emailPassword) return { ok: false, processed: 0, error: "Usuário/senha de e-mail ausentes" };

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host,
    port,
    secure: true, // 993 = IMAP over SSL
    auth: { user: s.emailUser, pass: s.emailPassword },
    logger: false,
  });

  let processed = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      for (const uid of uids || []) {
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0];
          await ingestInboundEmail(db, {
            fromEmail: fromAddr?.address ?? "",
            fromName: fromAddr?.name ?? fromAddr?.address ?? "",
            subject: parsed.subject ?? "Sem assunto",
            body: parsed.text || parsed.html || "", // parsed.html pode ser `false`; || garante string
            rawPayload: { uid, messageId: parsed.messageId },
            source: "titan_imap",
          });
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          processed++;
        } catch (err: any) {
          console.error(`[IMAP] Falha ao processar UID ${uid}:`, err?.message);
          // não marca como lida — tenta de novo no próximo poll
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true, processed };
  } catch (err: any) {
    try { await client.logout(); } catch { /* ignore */ }
    return { ok: false, processed, error: err?.message ?? "Erro IMAP desconhecido" };
  }
}

/**
 * Register webhook endpoints for external integrations.
 * All webhook routes must start with /api/ to be properly routed.
 */
export function registerWebhooks(app: Express) {
  // ─── CSV Import ────────────────────────────────────────────────────────────
  registerCsvImport(app);

  // ─── Digital Manager Guru Webhook ──────────────────────────────────────────
  app.post("/api/webhooks/guru", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const db = await getDb();

      // Extract key fields from Guru webhook payload
      const transactionId = payload?.invoice?.id || payload?.subscription?.id || null;
      const status = payload?.status || payload?.invoice?.status || "unknown";
      const contact = payload?.contact || {};
      const product = payload?.product || payload?.items?.[0] || {};
      const contactEmail = contact.email || null;
      const contactName = contact.name || null;
      const contactPhone = contact.phone_number ? `${contact.phone_local_code || ""}${contact.phone_number}` : null;
      const guruContactId = contact.id || null;
      const productId = product.id || product.marketplace_id || null;
      const productName = product.name || null;
      const purchaseValue = product.total_value || product.unit_value || payload?.invoice?.value || null;

      console.log(`[Guru Webhook] Event: status=${status}, email=${contactEmail}, product=${productName}`);

      // Log the event regardless
      if (db) {
        await db.insert(guruWebhookEvents).values({
          transactionId,
          contactEmail,
          contactName,
          productName,
          status,
          value: purchaseValue,
          rawPayload: payload,
          processedAt: new Date(),
          action: "pending",
        });

        // Update guruSettings lastEventAt
        await db.update(guruSettings).set({ lastEventAt: new Date() });
      }

      // Only process approved/paid transactions
      const isApproved = ["approved", "paid", "active"].includes(status?.toLowerCase());
      const isCanceled = ["canceled", "cancelled", "refunded", "chargedback"].includes(status?.toLowerCase());

      if (db && contactEmail) {
        // Find existing customer by email or guruContactId
        const conditions = [];
        if (contactEmail) conditions.push(eq(customers.email, contactEmail));
        if (guruContactId) conditions.push(eq(customers.guruContactId, guruContactId));

        const existing = await db.select().from(customers)
          .where(conditions.length > 1 ? or(...conditions) : conditions[0])
          .limit(1);

        if (isApproved) {
          if (existing.length) {
            // Update existing customer
            await db.update(customers).set({
              guruContactId: guruContactId || existing[0].guruContactId,
              guruTransactionId: transactionId,
              guruProductId: productId,
              guruProductName: productName || existing[0].guruProductName,
              guruPurchaseValue: purchaseValue || existing[0].guruPurchaseValue,
              guruPurchaseStatus: status,
              guruSyncedAt: new Date(),
              program: productName || existing[0].program,
              status: "Active",
              phone: contactPhone || existing[0].phone,
            }).where(eq(customers.id, existing[0].id));

            // Update event log with customerId and action
            if (transactionId) {
              await db.update(guruWebhookEvents)
                .set({ customerId: existing[0].id, action: "updated" })
                .where(eq(guruWebhookEvents.transactionId, transactionId));
            }
            console.log(`[Guru Webhook] Updated customer: ${contactName} (${contactEmail})`);
          } else {
            // Create new customer
            const [newCustomer] = await db.insert(customers).values({
              name: contactName || contactEmail,
              email: contactEmail,
              phone: contactPhone,
              guruContactId,
              guruTransactionId: transactionId,
              guruProductId: productId,
              guruProductName: productName,
              guruPurchaseValue: purchaseValue,
              guruPurchaseStatus: status,
              guruSyncedAt: new Date(),
              program: productName,
              status: "New",
            }).$returningId();

            // Update event log
            if (transactionId) {
              await db.update(guruWebhookEvents)
                .set({ customerId: newCustomer.id, action: "created" })
                .where(eq(guruWebhookEvents.transactionId, transactionId));
            }

            // Increment counter in guruSettings (best-effort, ignore if no row exists)
            try {
              await db.execute(
                `UPDATE guruSettings SET totalCustomersImported = COALESCE(totalCustomersImported, 0) + 1`
              );
            } catch (_) { /* ignore */ }
            // Auto-create a WhatsApp conversation with AI ONLY if WhatsApp channel is configured and active
            try {
              // Check if WhatsApp channel is active and configured before creating any conversation
              const [waSetting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
              const waIsReady = waSetting?.isActive && (
                (waSetting.waProvider === 'zapi' && waSetting.zapiInstanceId && waSetting.zapiToken) ||
                (waSetting.waProvider !== 'zapi' && waSetting.waPhoneNumberId && waSetting.waToken)
              );
              if (!waIsReady) {
                console.log(`[Guru Webhook] WhatsApp channel not configured/active — skipping AI conversation for ${contactName}`);
              } else {
                // Find best matching AI agent: exact product match first, then "all"
                const allActiveAgents = await db.select().from(aiAgents).where(eq(aiAgents.isActive, true));
                const matchingAgent = allActiveAgents.find(a =>
                  a.programFilter && productName && a.programFilter.toLowerCase() === productName.toLowerCase()
                ) || allActiveAgents.find(a => !a.programFilter || a.programFilter.toLowerCase() === 'all' || a.programFilter === '') || null;
                if (matchingAgent && contactPhone) {
                  // Create conversation
                  const [newConv] = await db.insert(conversations).values({
                    customerId: newCustomer.id,
                    channel: "whatsapp",
                    status: "Open",
                    handledByAi: true,
                    aiAgentId: matchingAgent.id,
                  }).$returningId();
                  // Send personalized greeting
                  if (matchingAgent.greetingMessage) {
                    const greeting = matchingAgent.greetingMessage
                      .replace(/\{\{nome\}\}/gi, contactName || 'cliente')
                      .replace(/\{\{name\}\}/gi, contactName || 'cliente')
                      .replace(/\{\{produto\}\}/gi, productName || '')
                      .replace(/\{\{product\}\}/gi, productName || '');
                    const sendResult = await sendMessageByConversation({ conversationId: newConv.id, content: greeting });
                    if (sendResult.success) {
                      await db.insert(messages).values({ conversationId: newConv.id, senderType: 'ai', content: greeting, senderId: null });
                      console.log(`[Guru Webhook] AI greeting sent to ${contactName} via agent "${matchingAgent.name}"`);
                    } else {
                      console.warn(`[Guru Webhook] Channel send failed for ${contactName}: ${sendResult.error} — message NOT recorded`);
                    }
                  }
                }
              }
            } catch (aiErr) {
              console.error('[Guru Webhook] Failed to create AI conversation:', aiErr);
            }
            console.log(`[Guru Webhook] Created new customer: ${contactName} (${contactEmail}) - Product: ${productName}`);
            // Start onboarding playbook automatically
            startJourneyForCustomer(newCustomer.id, "customer_created", productName).catch(err =>
              console.error("[Guru Webhook] Failed to start onboarding journey:", err)
            );
          }
        } else if (isCanceled && existing.length) {
          // Mark customer as churned on cancellation/refund
          await db.update(customers).set({
            guruPurchaseStatus: status,
            guruSyncedAt: new Date(),
            status: "Churned",
          }).where(eq(customers.id, existing[0].id));

          if (transactionId) {
            await db.update(guruWebhookEvents)
              .set({ customerId: existing[0].id, action: "churned" })
              .where(eq(guruWebhookEvents.transactionId, transactionId));
          }
          console.log(`[Guru Webhook] Marked customer as churned: ${contactEmail} (status: ${status})`);
        } else {
          // Non-actionable status (pending, waiting, etc.)
          if (transactionId) {
            await db.update(guruWebhookEvents)
              .set({ action: "ignored" })
              .where(eq(guruWebhookEvents.transactionId, transactionId));
          }
          console.log(`[Guru Webhook] Ignored event with status: ${status}`);
        }
      }

      res.status(200).json({ received: true, status });
    } catch (error) {
      console.error("[Guru Webhook] Error processing webhook:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ─── Go High Level Webhook ────────────────────────────────────────────────
  app.post("/api/webhooks/ghl", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const eventType = payload?.type || payload?.event;

      console.log(`[GHL Webhook] Received event: ${eventType}`, JSON.stringify(payload).slice(0, 200));

      const db = await getDb();
      if (!db) {
        console.warn("[GHL Webhook] DB unavailable, skipping processing");
        return res.status(200).json({ received: true });
      }

      // Handle ContactCreate and ContactUpdate
      if (eventType === "ContactCreate" || eventType === "ContactUpdate" || payload?.contact) {
        const contact = payload.contact || payload;
        const ghlContactId = contact.id || contact.contactId;
        const name = contact.name || contact.fullName || `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
        const email = contact.email;
        const phone = contact.phone;
        const tags = contact.tags || [];
        const program = contact.customField?.program || contact.customFields?.program;

        if (ghlContactId && name) {
          const existing = await db.select().from(customers)
            .where(eq(customers.ghlContactId, ghlContactId))
            .limit(1);

          if (existing.length) {
            await db.update(customers).set({
              name,
              email: email || existing[0].email,
              phone: phone || existing[0].phone,
              tags: tags.length ? tags : existing[0].tags,
              program: program || existing[0].program,
              ghlSyncedAt: new Date(),
            }).where(eq(customers.ghlContactId, ghlContactId));
            console.log(`[GHL Webhook] Updated contact: ${name} (${ghlContactId})`);
          } else {
            await db.insert(customers).values({
              ghlContactId,
              name,
              email,
              phone,
              tags,
              program,
              status: "New",
              ghlSyncedAt: new Date(),
            });
            console.log(`[GHL Webhook] Created contact: ${name} (${ghlContactId})`);
          }
        }
      }

      // Handle OpportunityCreate and OpportunityStatusChange
      if (eventType === "OpportunityCreate" || eventType === "OpportunityStatusChange" || payload?.opportunity) {
        const opp = payload.opportunity || payload;
        const contactId = opp.contactId || opp.contact?.id;
        const status = opp.status;
        const name = opp.name || opp.title;

        console.log(`[GHL Webhook] Opportunity event: ${name}, status: ${status}, contactId: ${contactId}`);

        // Find the customer and create a note about the opportunity
        if (contactId) {
          const existing = await db.select().from(customers)
            .where(eq(customers.ghlContactId, contactId))
            .limit(1);

          if (existing.length && status) {
            // Update customer status based on opportunity
            let customerStatus = existing[0].status;
            if (status === "won") customerStatus = "Active";
            else if (status === "lost") customerStatus = "Churned";
            else if (status === "open") customerStatus = "New";

            await db.update(customers).set({
              status: customerStatus,
              ghlSyncedAt: new Date(),
            }).where(eq(customers.ghlContactId, contactId));
          }
        }
      }

      res.status(200).json({ received: true, event: eventType });
    } catch (error) {
      console.error("[GHL Webhook] Error processing webhook:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ─── Instagram DM Webhook ──────────────────────────────────────────────────
  app.get("/api/webhooks/instagram", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "cs_platform_instagram_verify";
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[Instagram Webhook] Verified successfully");
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: "Verification failed" });
    }
  });

  app.post("/api/webhooks/instagram", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (body.object === "instagram") {
        const db = await getDb();
        for (const entry of body.entry || []) {
          for (const messaging of entry.messaging || []) {
            const senderId = messaging.sender?.id;
            const messageText = messaging.message?.text;
            if (!senderId || !messageText || !db) continue;

            // Find or create customer by instagram sender id
            const existing = await db.select().from(customers).where(eq(customers.phone, `ig:${senderId}`)).limit(1);
            let customerId: number;
            if (existing.length) {
              customerId = existing[0].id;
            } else {
              const [nc] = await db.insert(customers).values({ name: `Instagram User ${senderId}`, phone: `ig:${senderId}`, status: "New" }).$returningId();
              customerId = nc.id;
            }

            // Find or create open conversation
            const openConvs = await db.select().from(conversations).where(eq(conversations.customerId, customerId)).limit(1);
            let conversationId: number;
            if (openConvs.length && openConvs[0].status !== "Closed") {
              conversationId = openConvs[0].id;
            } else {
              const [nc] = await db.insert(conversations).values({ customerId, channel: "instagram", status: "Open" }).$returningId();
              conversationId = nc.id;
            }

            const { messages: messagesTable } = await import("../drizzle/schema");
            await db.insert(messagesTable).values({ conversationId, senderType: "customer", content: messageText });
            // Trigger AI auto-reply if conversation is handled by AI
            triggerAiAutoReply(conversationId, messageText).catch(() => {});
            console.log(`[Instagram Webhook] Message from ${senderId}: ${messageText}`);
          }
        }
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Instagram Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Telegram Bot Webhook ─────────────────────────────────────────────────
  app.post("/api/webhooks/telegram", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const message = body.message || body.channel_post;
      if (!message) return res.status(200).json({ received: true });

      const chatId = message.chat?.id?.toString();
      const text = message.text;
      const senderName = message.from?.first_name || message.from?.username || chatId;
      const db = await getDb();
      if (!chatId || !text || !db) return res.status(200).json({ received: true });

      // Find or create customer by telegram chat id
      const existing = await db.select().from(customers).where(eq(customers.phone, `tg:${chatId}`)).limit(1);
      let customerId: number;
      if (existing.length) {
        customerId = existing[0].id;
      } else {
        const [nc] = await db.insert(customers).values({ name: senderName, phone: `tg:${chatId}`, status: "New" }).$returningId();
        customerId = nc.id;
      }

      // Find or create open conversation
      const openConvs = await db.select().from(conversations).where(eq(conversations.customerId, customerId)).limit(1);
      let conversationId: number;
      if (openConvs.length && openConvs[0].status !== "Closed") {
        conversationId = openConvs[0].id;
      } else {
        const [nc] = await db.insert(conversations).values({ customerId, channel: "telegram", status: "Open" }).$returningId();
        conversationId = nc.id;
      }

       const { messages: messagesTable } = await import("../drizzle/schema");
      await db.insert(messagesTable).values({ conversationId, senderType: "customer", content: text });
      // Trigger AI auto-reply if conversation is handled by AI
      triggerAiAutoReply(conversationId, text).catch(() => {});
      console.log(`[Telegram Webhook] Message from ${senderName} (${chatId}): ${text}`);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Telegram Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── WhatsApp Business API Webhook ────────────────────────────────────────
  // Webhook verification (GET request from Meta)
  app.get("/api/webhooks/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "cs_platform_verify_token";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[WhatsApp Webhook] Verified successfully");
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: "Verification failed" });
    }
  });

  // Incoming WhatsApp messages (POST from Meta)
  app.post("/api/webhooks/whatsapp", async (req: Request, res: Response) => {
    try {
      const body = req.body;

      if (body.object === "whatsapp_business_account") {
        const db = await getDb();

        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field === "messages") {
              const value = change.value;

              for (const message of value.messages || []) {
                const from = message.from; // Customer's phone number or group ID
                const messageText = message.text?.body || message.caption || message.type;
                const timestamp = new Date(parseInt(message.timestamp) * 1000);

                // ─── Detect WhatsApp Group messages ──────────────────────────
                // In Meta Business API, group messages have the group ID in the
                // recipient field (ends with @g.us or is in the group metadata)
                const isGroupMsg = from?.endsWith("@g.us") ||
                  message.context?.group_id?.endsWith("@g.us") ||
                  value.metadata?.group_id?.endsWith("@g.us");

                if (isGroupMsg && db) {
                  const groupId = from || message.context?.group_id || value.metadata?.group_id;
                  const groupName = value.contacts?.[0]?.profile?.name ||
                    value.metadata?.display_phone_number ||
                    `Grupo ${groupId}`;
                  const senderId = message.from || "unknown";
                  const senderName = value.contacts?.find((c: any) => c.wa_id === senderId)?.profile?.name || senderId;

                  console.log(`[WhatsApp Webhook] Group message from ${senderName} in group ${groupId}: ${messageText}`);

                  // Upsert group into whatsappGroups table
                  const existingGroups = await db.select().from(whatsappGroups)
                    .where(eq(whatsappGroups.groupId, groupId)).limit(1);

                  if (existingGroups.length === 0) {
                    await db.insert(whatsappGroups).values({
                      groupId,
                      groupName,
                      isMonitored: true,
                      lastCustomerMessageAt: timestamp,
                    });
                  } else {
                    await db.update(whatsappGroups)
                      .set({ lastCustomerMessageAt: timestamp, updatedAt: new Date() })
                      .where(eq(whatsappGroups.groupId, groupId));
                  }

                  // Insert group message
                  if (messageText) {
                    await db.insert(groupMessages).values({
                      groupId,
                      externalMessageId: message.id,
                      senderId,
                      senderName,
                      senderType: "customer",
                      content: messageText,
                      messageType: message.type || "text",
                      timestamp,
                    });
                  }
                  continue; // Don't process group messages as individual conversations
                }

                // ─── Regular 1:1 message ─────────────────────────────────────
                console.log(`[WhatsApp Webhook] Message from ${from}: ${messageText}`);

                if (db && from && messageText) {
                  // Find or create customer by phone
                  const existingCustomers = await db.select().from(customers)
                    .where(eq(customers.phone, from))
                    .limit(1);

                  let customerId: number;
                  if (existingCustomers.length) {
                    customerId = existingCustomers[0].id;
                  } else {
                    const [newCustomer] = await db.insert(customers).values({
                      name: value.contacts?.[0]?.profile?.name || from,
                      phone: from,
                      status: "New",
                    }).$returningId();
                    customerId = newCustomer.id;
                  }

                  // Find open conversation or create new one
                  const openConversations = await db.select().from(conversations)
                    .where(eq(conversations.customerId, customerId))
                    .limit(1);

                  let conversationId: number;
                  if (openConversations.length && openConversations[0].status !== "Closed") {
                    conversationId = openConversations[0].id;
                  } else {
                    const [newConv] = await db.insert(conversations).values({
                      customerId,
                      channel: "whatsapp",
                      status: "Open",
                    }).$returningId();
                    conversationId = newConv.id;
                  }

                  // Insert the message
                  const { messages: messagesTable } = await import("../drizzle/schema");
                  await db.insert(messagesTable).values({
                    conversationId,
                    senderType: "customer",
                    content: messageText,
                    whatsappMessageId: message.id,
                    createdAt: timestamp,
                  });
                  // Trigger AI auto-reply if conversation is handled by AI
                  triggerAiAutoReply(conversationId, messageText).catch(() => {});
                }
              }
            }
          }
        }
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[WhatsApp Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Pagar.me Chargeback Webhook ────────────────────────────────────────────────────────────
  app.post("/api/webhooks/pagarme", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const eventType = payload?.type || payload?.event;
      const isChargeback = eventType?.includes("chargeback") || payload?.object === "chargeback" || eventType === "transaction.chargedback";

      console.log(`[Pagar.me Webhook] Event: ${eventType}`, JSON.stringify(payload).slice(0, 200));

      if (isChargeback) {
        const db = await getDb();
        if (!db) return res.status(200).json({ received: true });

        const transaction = payload?.transaction || payload?.data || payload;
        const customerEmail = transaction?.customer?.email || transaction?.billing?.email || null;
        const customerName = transaction?.customer?.name || transaction?.billing?.name || "Unknown";
        const amount = transaction?.amount || transaction?.paid_amount || 0;
        const transactionId = transaction?.id || transaction?.tid || null;

        // Find existing customer by email
        let customerId: number | null = null;
        if (customerEmail) {
          const existing = await db.select().from(customers).where(eq(customers.email, customerEmail)).limit(1);
          if (existing.length) {
            customerId = existing[0].id;
            // Mark customer as at risk
            await db.update(customers).set({ status: "At Risk" }).where(eq(customers.id, customerId));
          }
        }

        // Create a conversation/alert ticket for the chargeback
        const { messages: messagesTable, conversationLabels } = await import("../drizzle/schema");
        const chargebackConvInsert: typeof conversations.$inferInsert = {
          channel: "email",
          status: "Open",
          subject: `⚠️ Chargeback - ${customerName} - R$${(amount / 100).toFixed(2)}`,
          ...(customerId !== null ? { customerId } : {}),
        };
        const [newConv] = await db.insert(conversations).values(chargebackConvInsert).$returningId();

        // Add chargeback label
        await db.insert(conversationLabels).values({
          conversationId: newConv.id,
          label: "Chargeback",
          color: "#ef4444",
          createdBy: 0,
        });

        // Add system message with details
        await db.insert(messagesTable).values({
          conversationId: newConv.id,
          senderType: "system",
          content: `⚠️ CHARGEBACK DETECTADO\n\nCliente: ${customerName}\nEmail: ${customerEmail || "N/A"}\nValor: R$${(amount / 100).toFixed(2)}\nID Transacao: ${transactionId || "N/A"}\nEvento: ${eventType}\n\nAção necessária: Entrar em contato com o cliente e verificar o motivo do chargeback.`,
        });

        // Also insert into alerts table for the Alerts page
        await db.insert(alerts).values({
          type: "chargeback",
          title: `Chargeback - ${customerName}`,
          description: `Chargeback detectado. Valor: R$${(amount / 100).toFixed(2)}. ID: ${transactionId || "N/A"}`,
          customerId: customerId || undefined,
          customerName,
          customerEmail: customerEmail || undefined,
          amount: amount / 100,
          externalId: transactionId || undefined,
          status: "open",
          rawPayload: payload,
        });

        console.log(`[Pagar.me Webhook] Chargeback alert created for ${customerName} (${customerEmail}), amount: R$${(amount / 100).toFixed(2)}`);
      }

      res.status(200).json({ received: true, event: eventType });
    } catch (error) {
      console.error("[Pagar.me Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Email Ticket Webhook (Reclame Aqui e outros) ────────────────────────────────────────
  // Receives parsed email data and creates a support ticket
  app.post("/api/webhooks/email-ticket", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const subject = payload?.subject || payload?.Subject || "Sem assunto";
      const from = payload?.from || payload?.From || "";
      const body = payload?.body || payload?.Body || payload?.text || payload?.html || "";
      const fromEmail = typeof from === "string" ? from.match(/<(.+)>/)?.[1] || from : from?.email || "";
      const fromName = typeof from === "string" ? from.replace(/<.+>/, "").trim() : from?.name || fromEmail;

      console.log(`[Email Ticket] Received email from ${fromEmail}: ${subject}`);

      const db = await getDb();
      if (!db) return res.status(200).json({ received: true });

      const result = await ingestInboundEmail(db, {
        fromEmail,
        fromName,
        subject,
        body,
        rawPayload: payload,
        source: payload?.source,
      });

      res.status(200).json({ received: true, conversationId: result.conversationId, isReclameAqui: result.isReclameAqui });
    } catch (error) {
      console.error("[Email Ticket] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Leitor IMAP da Titan (recebimento) ───────────────────────────────────
  // Chamado pelo scheduler externo (ex.: a cada 2-5 min) para puxar e-mails novos.
  // Se a env CRON_SECRET estiver definida, exige o header x-cron-secret; caso
  // contrário fica aberto (mesma postura dos demais /api/scheduled/* deste build).
  app.post("/api/scheduled/poll-email", async (req: Request, res: Response) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
      return res.status(401).json({ ok: false, error: "Não autorizado" });
    }
    try {
      const result = await pollTitanInbox();
      res.status(result.ok ? 200 : 502).json(result);
    } catch (error: any) {
      console.error("[IMAP Poll] Error:", error);
      res.status(500).json({ ok: false, error: error?.message ?? "Processing failed" });
    }
  });

  // ─── Scheduled Messages Executor ─────────────────────────────────────────
  // Called by the periodic scheduled task to send pending messages whose time has come.
  // Requires a valid session cookie (role: user or admin).
  app.post("/api/scheduled/send-scheduled", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const now = new Date();

      // Find all pending messages whose scheduledAt <= now
      const pending = await db
        .select()
        .from(scheduledMessages)
        .where(
          and(
            eq(scheduledMessages.status, "pending"),
            lte(scheduledMessages.scheduledAt, now)
          )
        )
        .limit(50);

      if (pending.length === 0) {
        return res.status(200).json({ processed: 0, message: "Nenhuma mensagem pendente" });
      }

      let processed = 0;
      let failed = 0;

      for (const sm of pending) {
        try {
          // 1. Try to send via external channel (WhatsApp, Email, Telegram, etc.)
          const sendResult = await sendMessageByConversation({
            conversationId: sm.conversationId,
            content: sm.content,
          });

          // 2. Insert the message into the conversation (always, even if external send fails)
          await db.insert(messages).values({
            conversationId: sm.conversationId,
            content: sm.content,
            senderType: "agent",
            senderId: sm.createdBy,
            isInternal: false,
            whatsappMessageId: sendResult.externalId ?? null,
          });

          // 3. Update conversation updatedAt
          await db
            .update(conversations)
            .set({ updatedAt: now })
            .where(eq(conversations.id, sm.conversationId));

          // 4. Mark as sent or failed based on external send result
          if (sendResult.success) {
            await db
              .update(scheduledMessages)
              .set({ status: "sent", sentAt: now })
              .where(eq(scheduledMessages.id, sm.id));
            processed++;
          } else {
            // External send failed — persist error details for diagnosis and retry
            const errorMsg = sendResult.error ?? "Erro desconhecido ao enviar mensagem";
            console.warn(`[ScheduledMsg] Mensagem ${sm.id} não enviada externamente: ${errorMsg}`);
            await db
              .update(scheduledMessages)
              .set({
                status: "failed",
                lastError: errorMsg.substring(0, 500), // cap at 500 chars
                retryCount: (sm.retryCount ?? 0) + 1,
              })
              .where(eq(scheduledMessages.id, sm.id));
            failed++;
          }
        } catch (err: any) {
          const errMsg = err?.message ?? "Erro interno no executor";
          console.error(`[ScheduledMsg] Failed to send message ${sm.id}:`, err);
          await db
            .update(scheduledMessages)
            .set({
              status: "failed",
              lastError: errMsg.substring(0, 500),
              retryCount: (sm.retryCount ?? 0) + 1,
            })
            .where(eq(scheduledMessages.id, sm.id));
          failed++;
        }
      }

      console.log(`[ScheduledMsg] Processed: ${processed}, Failed: ${failed}`);
      res.status(200).json({ processed, failed, total: pending.length });
    } catch (error) {
      console.error("[ScheduledMsg] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Generic Upload Endpoint (for task attachments) ───────────────────────────────────────
  app.post("/api/upload", async (req: Request, res: Response) => {
    try {
      const { key, mimeType, data } = req.body as { key: string; mimeType: string; data: number[] };
      if (!key || !mimeType || !data) return res.status(400).json({ error: "key, mimeType, data required" });
      const buffer = Buffer.from(data);
      const { url, key: fileKey } = await storagePut(key, buffer, mimeType);
      res.status(200).json({ url, fileKey });
    } catch (error) {
      console.error("[Upload] Error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // --- Media Upload Endpoint ---
  // Accepts base64-encoded file data and stores it in S3.
  // Used by the chat UI for image, audio, and document attachments.
  app.post("/api/upload-media", async (req: Request, res: Response) => {
    try {
      const { data, mimeType, filename } = req.body as {
        data: string; // base64
        mimeType: string;
        filename?: string;
      };

      if (!data || !mimeType) {
        return res.status(400).json({ error: "data and mimeType are required" });
      }

      const buffer = Buffer.from(data, "base64");
      const ext = mimeType.split("/")[1]?.split(";")?.[0] || "bin";
      const key = `chat-media/${Date.now()}-${filename || `file.${ext}`}`;
      const { url } = await storagePut(key, buffer, mimeType);

      res.status(200).json({ url, key, mimeType });
    } catch (error) {
      console.error("[Upload Media] Error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });
  // ─── Z-API WhatsApp Webhook ──────────────────────────────────────────────────
  // Configure in Z-API dashboard: https://app.z-api.io → Instance → Webhooks → On Message Received
  // URL: https://your-domain.com/api/webhooks/zapi
  app.post("/api/webhooks/zapi", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      // Z-API sends different event types; we only care about incoming messages
      if (!body.phone || !body.text?.message) {
        return res.status(200).json({ received: true }); // ignore non-message events
      }
      const from: string = body.phone.replace(/\D/g, "");
      const messageText: string = body.text.message;
      const senderName: string = body.senderName || from;
      console.log(`[Z-API Webhook] Message from ${from}: ${messageText}`);
      const db = await getDb();
      if (!db) return res.status(200).json({ received: true });
      // Find or create customer by phone
      const existingCustomers = await db.select().from(customers).where(eq(customers.phone, from)).limit(1);
      let customerId: number;
      if (existingCustomers.length) {
        customerId = existingCustomers[0].id;
      } else {
        const [newCustomer] = await db.insert(customers).values({ name: senderName, phone: from, status: "New" }).$returningId();
        customerId = newCustomer.id;
      }
      // Find open conversation or create new one
      const openConversations = await db.select().from(conversations)
        .where(eq(conversations.customerId, customerId)).limit(1);
      let conversationId: number;
      if (openConversations.length && openConversations[0].status !== "Closed") {
        conversationId = openConversations[0].id;
      } else {
        const [newConv] = await db.insert(conversations).values({ customerId, channel: "whatsapp", status: "Open" }).$returningId();
        conversationId = newConv.id;
      }
      // Insert the message
      const { messages: messagesTable } = await import("../drizzle/schema");
      await db.insert(messagesTable).values({ conversationId, senderType: "customer", content: messageText });
      // Trigger AI auto-reply if conversation is handled by AI
       triggerAiAutoReply(conversationId, messageText).catch(() => {});
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Z-API Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Evolution API WhatsApp Webhook ─────────────────────────────────────────
  // Configure in Evolution API docker-compose.yml:
  //   WEBHOOK_GLOBAL_URL: https://reino-cs.manus.space/api/webhooks/evolution
  //   WEBHOOK_EVENTS_MESSAGES_UPSERT: "true"
  // Evolution API v2 sends: { event: "messages.upsert", instance: "...", data: { key, message, pushName, ... } }
  app.post("/api/webhooks/evolution", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      // Only process incoming messages
      if (body.event !== "messages.upsert") {
        return res.status(200).json({ received: true });
      }
      const data = body.data;
      // Skip messages sent by us (fromMe) to avoid echo loops
      if (!data || data.key?.fromMe === true) {
        return res.status(200).json({ received: true });
      }
      // Extract message text — Evolution API nests content in multiple possible fields
      const messageText: string =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        data.message?.imageMessage?.caption ||
        "";
      if (!messageText.trim()) {
        return res.status(200).json({ received: true }); // ignore media-only messages
      }
      // Phone number: remoteJid format is "5511999999999@s.whatsapp.net"
      const rawJid: string = data.key?.remoteJid ?? "";
      const from: string = rawJid.replace(/@.*$/, "").replace(/\D/g, "");
      if (!from) return res.status(200).json({ received: true });
      const senderName: string = data.pushName || from;
      console.log(`[Evolution Webhook] Message from ${from} (${senderName}): ${messageText.substring(0, 80)}`);
      const db = await getDb();
      if (!db) return res.status(200).json({ received: true });
      // Find or create customer by phone
      const existingCustomers = await db.select().from(customers).where(eq(customers.phone, from)).limit(1);
      let customerId: number;
      if (existingCustomers.length) {
        customerId = existingCustomers[0].id;
      } else {
        const [newCustomer] = await db.insert(customers).values({ name: senderName, phone: from, status: "New" }).$returningId();
        customerId = newCustomer.id;
      }
      // Find open conversation or create new one
      const openConversations = await db.select().from(conversations)
        .where(eq(conversations.customerId, customerId)).limit(1);
      let conversationId: number;
      if (openConversations.length && openConversations[0].status !== "Closed") {
        conversationId = openConversations[0].id;
      } else {
        const [newConv] = await db.insert(conversations).values({ customerId, channel: "whatsapp", status: "Open" }).$returningId();
        conversationId = newConv.id;
      }
      // Insert the incoming message
      const { messages: messagesTable } = await import("../drizzle/schema");
      await db.insert(messagesTable).values({ conversationId, senderType: "customer", content: messageText });
      // Trigger AI auto-reply
      triggerAiAutoReply(conversationId, messageText).catch(() => {});
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Evolution Webhook] Error:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // ─── Scheduled Task Endpointss ──────────────────────────────────────────────
  // These endpoints are called by Manus scheduled tasks (every 30min / 1h / daily)
  // They require a valid session cookie (role: user) injected by the platform.

  app.post("/api/scheduled/process-journeys", async (req: Request, res: Response) => {
    try {
      const { processJourneys } = await import("./playbookEngine");
      const result = await processJourneys();
      console.log("[Scheduled] process-journeys:", result);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled] process-journeys error:", err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  app.post("/api/scheduled/evaluate-triggers", async (req: Request, res: Response) => {
    try {
      const { evaluateTriggers } = await import("./automationEngine");
      const result = await evaluateTriggers();
      console.log("[Scheduled] evaluate-triggers:", result);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled] evaluate-triggers error:", err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  app.post("/api/scheduled/recalculate-health", async (req: Request, res: Response) => {
    try {
      const { recalculateAllHealthScores } = await import("./automationEngine");
      const result = await recalculateAllHealthScores();
      console.log("[Scheduled] recalculate-health:", result);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled] recalculate-health error:", err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Analisa todos os grupos monitorados (roda a cada 1h via scheduled task)
  app.post("/api/scheduled/analyze-groups", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false, error: 'DB unavailable' }); return; }
      const { whatsappGroups: wg, groupMessages: gm, groupAlerts: ga } = await import("../drizzle/schema");
      const { eq: eqOp, and: andOp, desc: descOp } = await import("drizzle-orm");
      const { notifyOwner } = await import("./_core/notification");
      const monitoredGroups = await db.select().from(wg).where(eqOp(wg.isMonitored, true));
      let totalAnalyzed = 0;
      let totalAlerts = 0;
      for (const group of monitoredGroups) {
        try {
          const msgs = await db.select().from(gm)
            .where(andOp(eqOp(gm.groupId, group.groupId), eqOp(gm.analyzed, false)))
            .orderBy(descOp(gm.timestamp)).limit(100);
          if (msgs.length === 0) continue;
          const now = new Date();
          const newAlerts: typeof ga.$inferInsert[] = [];
          const silenceHours = group.alertSilenceHours || 48;
          if (group.lastCustomerMessageAt && (!group.lastAgentMessageAt || group.lastCustomerMessageAt > group.lastAgentMessageAt)) {
            const hoursSince = (now.getTime() - group.lastCustomerMessageAt.getTime()) / (1000 * 60 * 60);
            if (hoursSince >= silenceHours) {
              newAlerts.push({ groupId: group.groupId, groupName: group.groupName, type: 'silence', severity: hoursSince >= silenceHours * 2 ? 'critical' : 'high', message: `Grupo "${group.groupName}" sem resposta há ${Math.round(hoursSince)}h.` });
            }
          }
          const msgText = msgs.slice(0, 20).map(m => `[${m.senderType}] ${m.senderName || m.senderId}: ${m.content}`).join('\n');
          try {
            const aiRes = await invokeLLM({ messages: [{ role: 'system', content: 'Retorne JSON: { hasPendingRequest: boolean, pendingRequestSummary: string, overallSentiment: "positive"|"neutral"|"negative", summary: string, urgencyLevel: "low"|"medium"|"high" }' }, { role: 'user', content: `Grupo "${group.groupName}":\n${msgText}` }], response_format: { type: 'json_schema', json_schema: { name: 'ga', strict: true, schema: { type: 'object', properties: { hasPendingRequest: { type: 'boolean' }, pendingRequestSummary: { type: 'string' }, overallSentiment: { type: 'string', enum: ['positive','neutral','negative'] }, summary: { type: 'string' }, urgencyLevel: { type: 'string', enum: ['low','medium','high'] } }, required: ['hasPendingRequest','pendingRequestSummary','overallSentiment','summary','urgencyLevel'], additionalProperties: false } } } });
            const analysis = JSON.parse(aiRes.choices[0].message.content as string);
            if (analysis.hasPendingRequest) newAlerts.push({ groupId: group.groupId, groupName: group.groupName, type: 'unanswered_request', severity: analysis.urgencyLevel === 'high' ? 'high' : 'medium', message: `Pedido não respondido: ${analysis.pendingRequestSummary}`, aiSummary: analysis.summary });
            if (analysis.overallSentiment === 'negative') newAlerts.push({ groupId: group.groupId, groupName: group.groupName, type: 'negative_sentiment', severity: 'medium', message: `Sentimento negativo no grupo "${group.groupName}".`, aiSummary: analysis.summary });
          } catch { /* IA falhou */ }
          for (const alert of newAlerts) await db.insert(ga).values(alert);
          for (const msg of msgs) await db.update(gm).set({ analyzed: true }).where(eqOp(gm.id, msg.id));
          const criticals = newAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');
          if (criticals.length > 0) await notifyOwner({ title: `⚠️ Alerta Grupo: ${group.groupName}`, content: criticals.map(a => a.message).join('\n') });
          totalAnalyzed += msgs.length;
          totalAlerts += newAlerts.length;
        } catch { /* grupo falhou, continua */ }
      }
      console.log(`[Scheduled] analyze-groups: ${monitoredGroups.length} grupos, ${totalAnalyzed} msgs, ${totalAlerts} alertas`);
      res.json({ ok: true, groupsProcessed: monitoredGroups.length, messagesAnalyzed: totalAnalyzed, alertsGenerated: totalAlerts });
    } catch (err: any) {
      console.error("[Scheduled] analyze-groups error:", err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Export customer conversation history as CSV
  app.get("/api/export/customer/:id/conversations", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: 'DB unavailable' }); return; }
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const format = (req.query.format as string) ?? 'csv';
      const { exportCustomerConversationsCSV, exportCustomerConversationsPDF } = await import('./channelHealth');
      if (format === 'pdf') {
        const pdfBuffer = await exportCustomerConversationsPDF(db as any, customerId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="historico-cliente-${customerId}.pdf"`);
        res.send(pdfBuffer);
      } else {
        const csv = await exportCustomerConversationsCSV(db as any, customerId);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="historico-cliente-${customerId}.csv"`);
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility
      }
    } catch (err: any) {
      console.error('[Export] customer conversations error:', err?.message);
      res.status(500).json({ error: err?.message });
    }
  });

  // Backup diário de conversas (todo dia às 2h)
  app.post("/api/scheduled/backup-conversations", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false, error: 'DB unavailable' }); return; }
      const { runDailyConversationBackup } = await import("./conversationBackup");
      const { notifyOwner } = await import("./_core/notification");
      const result = await runDailyConversationBackup(db as any);
      if (result.success) {
        await notifyOwner({
          title: `✅ Backup de Conversas — ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
          content: `${result.messagesBackedUp} mensagens salvas em backup.\nArquivo: ${result.storageKey ?? 'N/A'}`,
        });
      } else {
        await notifyOwner({
          title: `❌ Falha no Backup de Conversas`,
          content: `Erro: ${result.error ?? 'Desconhecido'}`,
        });
      }
      console.log('[Scheduled] backup-conversations:', result);
      res.json({ ok: result.success, ...result });
    } catch (err: any) {
      console.error('[Scheduled] backup-conversations error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Verificação de status do WhatsApp (a cada 30 minutos)
  app.post("/api/scheduled/check-whatsapp-status", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false, error: 'DB unavailable' }); return; }
      const { checkWhatsAppStatus } = await import("./conversationBackup");
      const { notifyOwner } = await import("./_core/notification");
      const result = await checkWhatsAppStatus(db as any);
      if (!result.isConnected) {
        await notifyOwner({
          title: `⚠️ WhatsApp Desconectado`,
          content: `O WhatsApp não está conectado. Verifique as configurações de integração.\nÚltima verificação: ${result.lastChecked.toLocaleString('pt-BR')}`,
        });
      }
      console.log('[Scheduled] check-whatsapp-status:', result);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[Scheduled] check-whatsapp-status error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Análise semanal de inteligência de comunicação (toda segunda-feira às 7h)
  app.post("/api/scheduled/overdue-tasks", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false, error: 'DB unavailable' }); return; }
      const { customerJourneyTasks, customers: customersTable } = await import('../drizzle/schema');
      const { eq, and, lt } = await import('drizzle-orm');
      const { notifyOwner } = await import('./_core/notification');
      const now = new Date();
      const overdueTasks = await db
        .select({
          id: customerJourneyTasks.id,
          title: customerJourneyTasks.title,
          dueDate: customerJourneyTasks.dueDate,
          priority: customerJourneyTasks.priority,
          customerId: customerJourneyTasks.customerId,
          customerName: customersTable.name,
          customerProgram: customersTable.program,
        })
        .from(customerJourneyTasks)
        .innerJoin(customersTable, eq(customerJourneyTasks.customerId, customersTable.id))
        .where(
          and(
            eq(customerJourneyTasks.status, 'pending'),
            lt(customerJourneyTasks.dueDate, now),
          )
        )
        .limit(50);
      if (overdueTasks.length === 0) {
        console.log('[Scheduled] overdue-tasks: nenhuma tarefa vencida');
        res.json({ ok: true, overdue: 0 });
        return;
      }
      const critical = overdueTasks.filter(t => t.priority === 'critical');
      const high = overdueTasks.filter(t => t.priority === 'high');
      const normal = overdueTasks.filter(t => t.priority === 'normal');
      const lines = overdueTasks.slice(0, 10).map(t => {
        const days = Math.floor((now.getTime() - (t.dueDate?.getTime() ?? now.getTime())) / 86400000);
        return `• ${t.customerName} (${t.customerProgram ?? 'sem programa'}) — ${t.title} [${days}d atraso]`;
      });
      const notifContent = [
        `⚠️ ${overdueTasks.length} tarefa(s) vencida(s) na jornada de clientes`,
        ``,
        `🔴 Críticas: ${critical.length} | 🟠 Altas: ${high.length} | 🔵 Normais: ${normal.length}`,
        ``,
        `Primeiras 10:`,
        ...lines,
        overdueTasks.length > 10 ? `... e mais ${overdueTasks.length - 10} tarefas.` : '',
      ].filter(Boolean).join('\n');
      await notifyOwner({
        title: `⏰ Tarefas Vencidas — ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
        content: notifContent,
      });
      console.log('[Scheduled] overdue-tasks:', overdueTasks.length, 'tarefas vencidas notificadas');
      res.json({ ok: true, overdue: overdueTasks.length, critical: critical.length, high: high.length });
    } catch (err: any) {
      console.error('[Scheduled] overdue-tasks error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  app.post("/api/scheduled/weekly-intelligence", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false, error: 'DB unavailable' }); return; }
      const { analyzeConversations, saveAnalysis } = await import("./communicationIntelligence");
      const { notifyOwner } = await import("./_core/notification");

      // Analisar os últimos 7 dias
      const result = await analyzeConversations(db, 7);
      await saveAnalysis(db, result, 7);

      // Montar resumo para notificação
      const sentimentEmoji = result.sentimentPositive >= 60 ? '🟢' : result.sentimentNegative >= 40 ? '🔴' : '🟡';
      const topTopics = result.topics.slice(0, 3).map((t: any) => `• ${t.topic} (${t.count}x)`).join('\n');
      const topSuggestions = result.suggestions.slice(0, 3).map((s: any) => `• [${s.category}] ${s.suggestion}`).join('\n');

      const notifContent = [
        `${sentimentEmoji} Sentimento geral: ${result.sentimentPositive}% positivo, ${result.sentimentNegative}% negativo`,
        `📊 ${result.totalMessages} mensagens analisadas`,
        ``,
        `🔥 Temas mais recorrentes:`,
        topTopics || '• Sem dados suficientes',
        ``,
        `💡 Sugestões da IA:`,
        topSuggestions || '• Sem sugestões esta semana',
      ].join('\n');

      await notifyOwner({
        title: `📬 Inteligência Semanal — ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
        content: notifContent,
      });

      console.log('[Scheduled] weekly-intelligence: análise concluída,', result.totalMessages, 'mensagens');
      res.json({ ok: true, totalMessages: result.totalMessages, topicsFound: result.topics.length, suggestionCount: result.suggestions.length });
    } catch (err: any) {
      console.error('[Scheduled] weekly-intelligence error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
}
