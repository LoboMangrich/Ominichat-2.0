import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
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
        status: z.string().optional(),
        phone: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await listSaraConversations(input);
      } catch (error) {
        throw wrapSaraError(error);
      }
    }),

  getConversation: protectedProcedure.input(conversationIdInput).query(async ({ input }) => {
    try {
      return await getSaraConversation(input.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  sendMessage: protectedProcedure
    .input(z.object({ id: z.string().min(1), text: z.string().min(1).max(4096) }))
    .mutation(async ({ input }) => {
      try {
        return await sendSaraMessage(input.id, input.text);
      } catch (error) {
        throw wrapSaraError(error);
      }
    }),

  takeover: protectedProcedure.input(conversationIdInput).mutation(async ({ input }) => {
    try {
      return await takeoverSaraConversation(input.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  release: protectedProcedure.input(conversationIdInput).mutation(async ({ input }) => {
    try {
      return await releaseSaraConversation(input.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  close: protectedProcedure.input(conversationIdInput).mutation(async ({ input }) => {
    try {
      return await closeSaraConversation(input.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),

  sendTyping: protectedProcedure.input(conversationIdInput).mutation(async ({ input }) => {
    try {
      return await sendSaraTypingIndicator(input.id);
    } catch (error) {
      throw wrapSaraError(error);
    }
  }),
});
