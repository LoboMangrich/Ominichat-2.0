import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { saraRouter } from "./sara";

const USER_ID = 7;

function createContext(): TrpcContext {
  return {
    user: {
      id: USER_ID,
      openId: "atendente@example.com",
      email: "atendente@example.com",
      name: "Atendente",
      role: "user",
    } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function errorResponse(status: number, rawBody: string): Response {
  return { ok: false, status, text: async () => rawBody } as unknown as Response;
}

describe("sara.sendMessage", () => {
  const originalUrl = ENV.saraSupportApiUrl;
  const originalKey = ENV.saraSupportApiKey;
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ENV.saraSupportApiUrl = "https://sara.example.test";
    ENV.saraSupportApiKey = "test-api-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    ENV.saraSupportApiUrl = originalUrl;
    ENV.saraSupportApiKey = originalKey;
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  async function sendAndCatch(): Promise<TRPCError> {
    const caller = saraRouter.createCaller(createContext());
    try {
      await caller.sendMessage({ id: "conv-1", text: "olá" });
    } catch (error) {
      return error as TRPCError;
    }
    throw new Error("sendMessage deveria ter lançado erro");
  }

  function sentActorId(): string {
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    return headers["x-sara-actor-id"];
  }

  it("409 sem dono: identifica o usuário logado e não vaza o corpo da Sara", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        409,
        JSON.stringify({
          error: { code: "CONFLICT", message: "Conversation not claimed yet — call /takeover first" },
        }),
      ),
    );

    const error = await sendAndCatch();

    expect(sentActorId()).toBe(String(USER_ID));
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.message).toContain("409");
    expect(error.message).not.toContain("not claimed");
  });

  it("403 com dono diferente: identifica o usuário logado e não vaza o corpo da Sara", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        403,
        JSON.stringify({
          error: { code: "FORBIDDEN", message: "Conversation is owned by a different operator" },
        }),
      ),
    );

    const error = await sendAndCatch();

    expect(sentActorId()).toBe(String(USER_ID));
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.message).toContain("403");
    expect(error.message).not.toContain("different operator");
  });
});

describe("sara.listConversations — status e sort são enums da doc", () => {
  const originalUrl = ENV.saraSupportApiUrl;
  const originalKey = ENV.saraSupportApiKey;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ENV.saraSupportApiUrl = "https://sara.example.test";
    ENV.saraSupportApiKey = "test-api-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    ENV.saraSupportApiUrl = originalUrl;
    ENV.saraSupportApiKey = originalKey;
    vi.unstubAllGlobals();
  });

  it("rejeita status fora do enum sem chamar a Sara", async () => {
    const caller = saraRouter.createCaller(createContext());
    await expect(caller.listConversations({ status: "closed" as never })).rejects.toThrow();
    await expect(caller.listConversations({ sort: "createdAt" as never })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
