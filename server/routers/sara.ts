import { TRPCError } from "@trpc/server";
import { desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  SARA_CONVERSATION_SORTS,
  SARA_CONVERSATION_STATUSES,
  SARA_FORBIDDEN_OTHER_ACTOR,
  SARA_UNIDENTIFIED_ACTOR_NOTICE,
  saraCanReleaseOrClose,
  saraCanSend,
} from "@shared/sara";
import { customers, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { phoneDigitCandidates, phoneLookupCandidates } from "../phoneMatch";
import {
  SaraSupportApiError,
  closeSaraConversation,
  getSaraConversation,
  listSaraConversations,
  releaseSaraConversation,
  sendSaraMessage,
  sendSaraTypingIndicator,
  takeoverSaraConversation,
  type SaraConversationSummary,
} from "../saraSupportClient";

function wrapSaraError(error: unknown): TRPCError {
  // Recusa nossa (ex.: FORBIDDEN de dono) já vem pronta — não rebaixar para 500.
  if (error instanceof TRPCError) return error;
  if (error instanceof SaraSupportApiError) {
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
        throw wrapSaraError(error);
      }
    }),

  getConversation: protectedProcedure.input(conversationIdInput).query(async ({ ctx, input }) => {
    try {
      const detail = await getSaraConversation(input.id, ctx.user.id);
      const names = await resolveActorNames([detail.conversation.actorId]);
      return { ...detail, conversation: withActor(detail.conversation, names, ctx.user) };
    } catch (error) {
      throw wrapSaraError(error);
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
        throw wrapSaraError(error);
      }
    }),

  takeover: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await takeoverSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  // Devolver/Encerrar: dono, Admin, ou qualquer um quando actorId é null.
  release: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanReleaseOrClose(actorId, user.id, user.role));
      return await releaseSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  close: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      await assertAllowed(input.id, ctx.user, (actorId, user) => saraCanReleaseOrClose(actorId, user.id, user.role));
      return await closeSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  sendTyping: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await sendSaraTypingIndicator(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
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
      const exact = phoneLookupCandidates(input.phone);
      if (exact.length === 0) return null;
      const db = await getDb();
      if (!db) return null;

      const columns = {
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        program: customers.program,
        status: customers.status,
        healthScore: customers.healthScore,
        mrr: customers.mrr,
        renewalDate: customers.renewalDate,
      };

      // 1ª tentativa: valor exato (usa idx_customers_phone).
      let matches = await db
        .select(columns)
        .from(customers)
        .where(inArray(customers.phone, exact))
        .orderBy(desc(customers.updatedAt))
        .limit(2);

      // 2ª tentativa: telefone gravado com pontuação, ex. "(48) 98405-3595".
      if (matches.length === 0) {
        const digits = phoneDigitCandidates(input.phone);
        matches = await db
          .select(columns)
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

      if (matches.length === 0) return null;
      return { customer: matches[0], ambiguous: matches.length > 1 };
    }),
});
