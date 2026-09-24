import { TRPCError } from "@trpc/server";
import { desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { SARA_CONVERSATION_SORTS, SARA_CONVERSATION_STATUSES } from "@shared/sara";
import { customers } from "../../drizzle/schema";
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
} from "../saraSupportClient";

function wrapSaraError(error: unknown): TRPCError {
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
        return await listSaraConversations(input, ctx.user.id);
      } catch (error) {
        throw wrapSaraError(error);
      }
    }),

  getConversation: protectedProcedure.input(conversationIdInput).query(async ({ ctx, input }) => {
    try {
      return await getSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  sendMessage: protectedProcedure
    .input(z.object({ id: z.string().min(1), text: z.string().min(1).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      try {
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

  release: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await releaseSaraConversation(input.id, ctx.user.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  close: protectedProcedure.input(conversationIdInput).mutation(async ({ ctx, input }) => {
    try {
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
