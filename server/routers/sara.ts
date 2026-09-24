import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  SARA_CONVERSATION_SORTS,
  SARA_CONVERSATION_STATUSES,
  SARA_FORBIDDEN_OTHER_ACTOR,
  SARA_UNIDENTIFIED_ACTOR_NOTICE,
  saraCanReleaseOrClose,
  saraCanSend,
} from "@shared/sara";
import { conversationTags, customers, saraConversationTags, saraInternalNotes, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { optionalEmail } from "../_core/validators";
import { mapWithConcurrency } from "../concurrency";
import { getDb } from "../db";
import { phoneDigitCandidates, phoneDigits, phoneLookupCandidates } from "../phoneMatch";
import { pendingSaraNotifications } from "../saraNotifications";
import {
  SaraSupportApiError,
  closeSaraConversation,
  getSaraAudioUrl,
  getSaraConversation,
  getSaraImageUrl,
  listSaraConversations,
  releaseSaraConversation,
  sendSaraMessage,
  sendSaraTypingIndicator,
  takeoverSaraConversation,
  type SaraConversationSummary,
} from "../saraSupportClient";

/** conversation.actorId do corpo do 409 do /takeover (schema da doc), se vier. */
function conflictActor(body: unknown): { present: boolean; actorId: string | null } {
  const conversation = (body as { conversation?: { actorId?: unknown } } | null)?.conversation;
  if (!conversation || typeof conversation !== "object") return { present: false, actorId: null };
  return { present: true, actorId: typeof conversation.actorId === "string" ? conversation.actorId : null };
}

async function wrapSaraError(error: unknown, userId?: number): Promise<TRPCError> {
  // Recusa nossa (ex.: FORBIDDEN de dono) já vem pronta — não rebaixar para 500.
  if (error instanceof TRPCError) return error;
  if (error instanceof SaraSupportApiError) {
    if (error.status === 409) {
      // 409 do /takeover traz quem já assumiu; outros 409 (ex.: "not claimed" no envio)
      // não têm conversation e ficam com a mensagem genérica.
      const conflict = conflictActor(error.body);
      if (conflict.present) {
        let who = "outro atendente";
        if (conflict.actorId !== null && conflict.actorId === String(userId)) {
          who = "você";
        } else if (conflict.actorId !== null) {
          who = (await resolveActorNames([conflict.actorId])).get(conflict.actorId) ?? who;
        }
        return new TRPCError({ code: "CONFLICT", message: `Já assumida por ${who}` });
      }
      return new TRPCError({ code: "CONFLICT", message: error.message });
    }
    return new TRPCError({
      code: error.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Erro desconhecido ao chamar a Sara Support API",
  });
}

const conversationIdInput = z.object({ id: z.string().min(1) });

// Etiqueta → conversas da Sara: a API da Sara não filtra por etiqueta, então buscamos
// cada conversa etiquetada por id. Limites porque a Sara é produção.
export const TAGGED_CONVERSATIONS_MAX_IDS = 50;
export const TAGGED_CONVERSATIONS_CONCURRENCY = 5;

type SaraUser = { id: number; role: string };

/**
 * Nome do atendente do Cashmiles para cada actorId (o nosso users.id em string).
 * Id não numérico, sem usuário ou sem banco → fica de fora (a tela mostra
 * "outro atendente").
 */
async function resolveActorNames(actorIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(
      actorIds
        .filter((id): id is string => id !== null && /^\d+$/.test(id))
        .map(id => Number(id))
        .filter(id => Number.isSafeInteger(id) && id > 0),
    ),
  );
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const db = await getDb();
  if (!db) return names;
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  for (const row of rows) if (row.name) names.set(String(row.id), row.name);
  return names;
}

function withActor<T extends Pick<SaraConversationSummary, "actorId">>(
  conversation: T,
  names: Map<string, string>,
  user: SaraUser,
) {
  return {
    ...conversation,
    actorName: conversation.actorId ? (names.get(conversation.actorId) ?? null) : null,
    assignedToMe: conversation.actorId === String(user.id),
    canSend: saraCanSend(conversation.actorId, user.id),
    canReleaseOrClose: saraCanReleaseOrClose(conversation.actorId, user.id, user.role),
  };
}

/** Motivo da recusa: sem identificação tem aviso próprio; senão, dono diferente. */
function forbiddenFor(actorId: string | null): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: actorId === null ? SARA_UNIDENTIFIED_ACTOR_NOTICE : SARA_FORBIDDEN_OTHER_ACTOR,
  });
}

/**
 * Checagem de dono NO SERVIDOR, antes de qualquer POST que altera a conversa real:
 * busca a conversa (GET, só leitura) e recusa sem chamar a Sara se não puder.
 */
async function assertAllowed(
  conversationId: string,
  user: SaraUser,
  allowed: (actorId: string | null, user: SaraUser) => boolean,
): Promise<void> {
  const { conversation } = await getSaraConversation(conversationId, user.id);
  if (!allowed(conversation.actorId, user)) throw forbiddenFor(conversation.actorId);
}

export const saraRouter = router({
  listConversations: protectedProcedure
    .input(
      z.object({
        status: z.enum(SARA_CONVERSATION_STATUSES).optional(),
        phone: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        sort: z.enum(SARA_CONVERSATION_SORTS).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const result = await listSaraConversations(input, ctx.user.id);
        const names = await resolveActorNames(result.data.map(c => c.actorId));
        return { ...result, data: result.data.map(c => withActor(c, names, ctx.user)) };
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),

  // Notificações do webhook da Sara para o usuário logado (id do contexto, nunca do client),
  // lidas pelo useNewConversationNotification no mesmo polling de 15s. Ver saraNotifications.ts.
  pendingNotifications: protectedProcedure
    .input(z.object({ afterId: z.number().int().min(0).nullable() }))
    .query(({ ctx, input }) => pendingSaraNotifications(ctx.user.id, input.afterId)),

  getConversation: protectedProcedure.input(conversationIdInput).query(async ({ ctx, input }) => {
    try {
      const detail = await getSaraConversation(input.id, ctx.user.id);
      const names = await resolveActorNames([detail.conversation.actorId]);
      return { ...detail, conversation: withActor(detail.conversation, names, ctx.user) };
    } catch (error) {
      throw await wrapSaraError(error, ctx.user.id);
    }
  }),

  // Só quem assumiu envia — sem exceção de Admin (saraCanSend).
  sendMessage: protectedProcedure
    .input(z.object({ id: z.string().min(1), text: z.string().min(1).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanSend(actorId, user.id));
        return await sendSaraMessage(input.id, input.text, ctx.user.id);
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),

  takeover: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await takeoverSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw await wrapSaraError(error, ctx.user.id);
    }
  }),

  // Devolver/Encerrar: dono, Admin, ou qualquer um quando actorId é null.
  release: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanReleaseOrClose(actorId, user.id, user.role));
      return await releaseSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw await wrapSaraError(error, ctx.user.id);
    }
  }),

  close: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanReleaseOrClose(actorId, user.id, user.role));
      return await closeSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw await wrapSaraError(error, ctx.user.id);
    }
  }),

  // "Digitando..." aparece para o cliente real: mesma regra do envio (só o dono).
  sendTyping: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanSend(actorId, user.id));
      return await sendSaraTypingIndicator(input.id, ctx.user.id);
    } catch (error) {
      throw await wrapSaraError(error, ctx.user.id);
    }
  }),
  // Mídia recebida: URL assinada de 900s, buscada sob demanda (só leitura, GET).
  // A URL não é logada em lugar nenhum.
  audioUrl: protectedProcedure
    .input(z.object({ audioMessageId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return await getSaraAudioUrl(input.audioMessageId, ctx.user.id);
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),

  imageUrl: protectedProcedure
    .input(z.object({ imageMessageId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return await getSaraImageUrl(input.imageMessageId, ctx.user.id);
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),

  // ── Nota interna (sussurro): só no Cashmiles, NUNCA vai para a Sara ──────────
  // Qualquer atendente escreve (não depende de ter assumido). O texto nunca é logado.
  listNotes: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: saraInternalNotes.id,
          text: saraInternalNotes.text,
          createdAt: saraInternalNotes.createdAt,
          authorId: saraInternalNotes.authorId,
          authorName: users.name,
        })
        .from(saraInternalNotes)
        .leftJoin(users, eq(saraInternalNotes.authorId, users.id))
        .where(eq(saraInternalNotes.saraConversationId, input.conversationId))
        .orderBy(asc(saraInternalNotes.createdAt), asc(saraInternalNotes.id));
    }),

  addNote: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).max(64),
        text: z.string().trim().min(1, "Escreva a nota").max(4096),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados indisponível — a nota não foi salva.",
        });
      }
      const [created] = await db
        .insert(saraInternalNotes)
        .values({ saraConversationId: input.conversationId, authorId: ctx.user.id, text: input.text })
        .$returningId();
      return { id: created.id };
    }),

  // ── Etiquetas personalizadas (conversationTags sem slug) em conversas da Sara ─────
  // Só no Cashmiles. Etiquetas de status (slug open/waiting/group) não são atribuídas:
  // vêm do status real da conversa.
  listConversationTags: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ tagId: conversationTags.id, name: conversationTags.name })
        .from(saraConversationTags)
        .innerJoin(conversationTags, eq(saraConversationTags.tagId, conversationTags.id))
        .where(eq(saraConversationTags.saraConversationId, input.conversationId))
        .orderBy(asc(conversationTags.name));
    }),

  addTag: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1).max(64), tagId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb("a etiqueta não foi salva");
      const [tag] = await db
        .select({ id: conversationTags.id, slug: conversationTags.slug })
        .from(conversationTags)
        .where(eq(conversationTags.id, input.tagId))
        .limit(1);
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Etiqueta não encontrada" });
      if (tag.slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Etiquetas de status vêm do status da conversa — escolha uma etiqueta personalizada.",
        });
      }
      // Unique (saraConversationId, tagId): repetir a etiqueta não duplica.
      await db
        .insert(saraConversationTags)
        .values({ saraConversationId: input.conversationId, tagId: input.tagId, assignedBy: ctx.user.id })
        .onDuplicateKeyUpdate({ set: { tagId: input.tagId } });
      return { success: true };
    }),

  removeTag: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1).max(64), tagId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb("a etiqueta não foi removida");
      await db
        .delete(saraConversationTags)
        .where(
          and(
            eq(saraConversationTags.saraConversationId, input.conversationId),
            eq(saraConversationTags.tagId, input.tagId),
          ),
        );
      return { success: true };
    }),

  /**
   * Conversas da Sara com uma etiqueta personalizada. Até 50 ids (as etiquetadas mais
   * recentemente), no máximo 5 GETs em paralelo. Id que a Sara responde 404 some da
   * lista sem erro — a linha da tabela NÃO é apagada (ver CLAUDE.md).
   */
  listTaggedConversations: protectedProcedure
    .input(z.object({ tagId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [] };
        const rows = await db
          .select({ id: saraConversationTags.saraConversationId })
          .from(saraConversationTags)
          .where(eq(saraConversationTags.tagId, input.tagId))
          .orderBy(desc(saraConversationTags.assignedAt))
          .limit(TAGGED_CONVERSATIONS_MAX_IDS);

        const found = await mapWithConcurrency(rows, TAGGED_CONVERSATIONS_CONCURRENCY, async row => {
          try {
            return (await getSaraConversation(row.id, ctx.user.id)).conversation;
          } catch (error) {
            if (error instanceof SaraSupportApiError && error.status === 404) return null;
            throw error;
          }
        });
        const conversations = found.filter((c): c is SaraConversationSummary => c !== null);
        const names = await resolveActorNames(conversations.map(c => c.actorId));
        return { data: conversations.map(c => withActor(c, names, ctx.user)) };
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),

  /**
   * Cliente do Cashmiles ligado a uma conversa da Sara, pelo telefone.
   * Sara é dona da conversa; Cashmiles é dono do cliente (CLAUDE.md). Nada
   * daqui vai para a Sara — é só leitura local para o painel lateral.
   */
  customerByPhone: protectedProcedure
    .input(z.object({ phone: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const matches = await findCustomersByPhone(db, input.phone);
      if (matches.length === 0) return null;
      return { customer: matches[0], ambiguous: matches.length > 1 };
    }),

  /**
   * Cadastra o cliente a partir de uma conversa da Sara ("Cliente não cadastrado").
   * O TELEFONE vem do servidor (GET da conversa na Sara, só leitura) — nunca do
   * client. Gravado como só dígitos com DDI ("5548984053595"), o mesmo formato
   * dos webhooks de WhatsApp Cloud/Z-API/Evolution, que procuram o cliente por
   * igualdade exata: assim a próxima mensagem por esses canais acha este cliente
   * em vez de criar outro.
   */
  registerCustomer: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
        name: z.string().trim().min(1, "Informe o nome").max(255),
        email: optionalEmail,
        program: z
          .string()
          .trim()
          .max(128)
          .optional()
          .transform(v => (v ? v : null)),
        status: z.enum(customers.status.enumValues).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { conversation } = await getSaraConversation(input.conversationId, ctx.user.id);
        const phone = conversation.phoneNumber ? phoneDigits(conversation.phoneNumber) : "";
        if (!phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conversa não tem telefone para cadastrar." });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível — não foi possível cadastrar o cliente.",
          });
        }

        // Checar e inserir não é atômico (mesma ressalva de findOrCreateOpenConversation);
        // risco baixo no volume atual.
        const existing = await findCustomersByPhone(db, phone);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe cliente com este telefone" });
        }

        const [created] = await db
          .insert(customers)
          .values({
            name: input.name,
            email: input.email ?? null,
            phone,
            program: input.program,
            status: input.status ?? "New",
          })
          .$returningId();
        return { id: created.id };
      } catch (error) {
        throw await wrapSaraError(error, ctx.user.id);
      }
    }),
});

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(what: string): Promise<Db> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Banco de dados indisponível — ${what}.` });
  }
  return db;
}

const customerPanelColumns = {
  id: customers.id,
  name: customers.name,
  email: customers.email,
  phone: customers.phone,
  program: customers.program,
  status: customers.status,
  healthScore: customers.healthScore,
  mrr: customers.mrr,
  renewalDate: customers.renewalDate,
  lifetimeValue: customers.lifetimeValue,
};

/**
 * Clientes com o mesmo telefone (até 2, o mais recente primeiro), tolerante a
 * formato: com/sem "+", com/sem 55, com/sem o 9º dígito, e com pontuação.
 */
async function findCustomersByPhone(db: Db, rawPhone: string) {
  const exact = phoneLookupCandidates(rawPhone);
  if (exact.length === 0) return [];

  // 1ª tentativa: valor exato (usa idx_customers_phone).
  const matches = await db
    .select(customerPanelColumns)
    .from(customers)
    .where(inArray(customers.phone, exact))
    .orderBy(desc(customers.updatedAt))
    .limit(2);
  if (matches.length > 0) return matches;

  // 2ª tentativa: telefone gravado com pontuação, ex. "(48) 98405-3595".
  const digits = phoneDigitCandidates(rawPhone);
  return db
    .select(customerPanelColumns)
    .from(customers)
    .where(
      sql`REGEXP_REPLACE(${customers.phone}, '[^0-9]', '') IN (${sql.join(
        digits.map(d => sql`${d}`),
        sql`, `,
      )})`,
    )
    .orderBy(desc(customers.updatedAt))
    .limit(2);
}
