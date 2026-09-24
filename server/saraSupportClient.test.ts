import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import {
  SaraSupportApiError,
  closeSaraConversation,
  getSaraConversation,
  listSaraConversations,
  releaseSaraConversation,
  sendSaraMessage,
  sendSaraTypingIndicator,
  takeoverSaraConversation,
} from "./saraSupportClient";

const ACTOR_ID = 42;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, rawBody: string): Response {
  return {
    ok: false,
    status,
    text: async () => rawBody,
  } as unknown as Response;
}

describe("saraSupportClient", () => {
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

  it("falha sem chamar a rede quando SARA_SUPPORT_API_URL/KEY não estão configurados", async () => {
    ENV.saraSupportApiUrl = "";
    ENV.saraSupportApiKey = "";

    await expect(listSaraConversations({}, ACTOR_ID)).rejects.toThrow(
      /SARA_SUPPORT_API_URL\/SARA_SUPPORT_API_KEY não configurados/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("monta a query string corretamente em listSaraConversations", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: [], pagination: { total: 0, limit: 10, offset: 5, hasMore: false } }),
    );

    await listSaraConversations({ status: "active", phone: "+5548999999999", limit: 10, offset: 5 }, ACTOR_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.origin + url.pathname).toBe("https://sara.example.test/api/v1/support/conversations");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("phone")).toBe("+5548999999999");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("5");
  });

  it("omite da query os parâmetros não informados", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    );

    await listSaraConversations({}, ACTOR_ID);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://sara.example.test/api/v1/support/conversations");
  });

  it("envia o header x-api-key em toda chamada", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { conversation: {}, messages: [] }));

    await getSaraConversation("conv-1", ACTOR_ID);

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-api-key");
  });

  it("define um timeout via AbortSignal em toda chamada", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { conversation: {}, messages: [] }));

    await getSaraConversation("conv-1", ACTOR_ID);

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("trata 404 com mensagem genérica, sem vazar o corpo bruto da resposta", async () => {
    const rawBody = JSON.stringify({ error: "conversation not found", phoneNumber: "+5548999999999" });
    fetchMock.mockResolvedValueOnce(errorResponse(404, rawBody));

    let caught: unknown;
    try {
      await getSaraConversation("missing", ACTOR_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SaraSupportApiError);
    const error = caught as SaraSupportApiError;
    expect(error.status).toBe(404);
    expect(error.message).toContain("404");
    expect(error.message).not.toContain("conversation not found");
    expect(error.message).not.toContain("+5548999999999");
    // o corpo bruto só deve ir pro log do servidor, nunca pro erro lançado
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(rawBody));
  });

  it("trata 500 com mensagem genérica, sem vazar o corpo bruto da resposta", async () => {
    const rawBody = JSON.stringify({ error: "internal error", stack: "em algum lugar sensível" });
    fetchMock.mockResolvedValueOnce(errorResponse(500, rawBody));

    let caught: unknown;
    try {
      await getSaraConversation("conv-1", ACTOR_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SaraSupportApiError);
    const error = caught as SaraSupportApiError;
    expect(error.status).toBe(500);
    expect(error.message).toContain("500");
    expect(error.message).not.toContain("stack");
    expect(error.message).not.toContain("sensível");
  });

  it("trata timeout com mensagem própria, distinta de falha de rede genérica", async () => {
    const timeoutError = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    fetchMock.mockRejectedValueOnce(timeoutError);

    let caught: unknown;
    try {
      await getSaraConversation("conv-1", ACTOR_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SaraSupportApiError);
    const error = caught as SaraSupportApiError;
    expect(error.message).toMatch(/não respondeu a tempo/i);
  });

  it("distingue timeout de outras falhas de rede", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    let caught: unknown;
    try {
      await getSaraConversation("conv-1", ACTOR_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SaraSupportApiError);
    const error = caught as SaraSupportApiError;
    expect(error.message).toMatch(/falha de rede/i);
    expect(error.message).not.toMatch(/não respondeu a tempo/i);
  });

  describe("x-sara-actor-id", () => {
    const calls: Array<[string, () => Promise<unknown>]> = [
      ["listSaraConversations", () => listSaraConversations({}, ACTOR_ID)],
      ["getSaraConversation", () => getSaraConversation("conv-1", ACTOR_ID)],
      ["sendSaraMessage", () => sendSaraMessage("conv-1", "olá", ACTOR_ID)],
      ["takeoverSaraConversation", () => takeoverSaraConversation("conv-1", ACTOR_ID)],
      ["releaseSaraConversation", () => releaseSaraConversation("conv-1", ACTOR_ID)],
      ["closeSaraConversation", () => closeSaraConversation("conv-1", ACTOR_ID)],
      ["sendSaraTypingIndicator", () => sendSaraTypingIndicator("conv-1", ACTOR_ID)],
    ];

    it.each(calls)("é enviado em %s com o id do usuário do Cashmiles", async (_name, call) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

      await call();

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["x-sara-actor-id"]).toBe("42");
      expect(headers["x-api-key"]).toBe("test-api-key");
    });
  });

  describe("envio recusado pela Sara", () => {
    async function sendAndCatch(): Promise<SaraSupportApiError> {
      try {
        await sendSaraMessage("conv-1", "olá", ACTOR_ID);
      } catch (error) {
        return error as SaraSupportApiError;
      }
      throw new Error("sendSaraMessage deveria ter lançado erro");
    }

    it("409 — conversa em human_takeover sem dono (precisa de /takeover antes)", async () => {
      const rawBody = JSON.stringify({
        error: { code: "CONFLICT", message: "Conversation not claimed yet — call /takeover first" },
      });
      fetchMock.mockResolvedValueOnce(errorResponse(409, rawBody));

      const error = await sendAndCatch();

      expect(error).toBeInstanceOf(SaraSupportApiError);
      expect(error.status).toBe(409);
      expect(error.message).toContain("409");
      expect(error.message).not.toContain("not claimed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(rawBody));
    });

    it("403 — conversa assumida por outro operador", async () => {
      const rawBody = JSON.stringify({
        error: { code: "FORBIDDEN", message: "Conversation is owned by a different operator" },
      });
      fetchMock.mockResolvedValueOnce(errorResponse(403, rawBody));

      const error = await sendAndCatch();

      expect(error).toBeInstanceOf(SaraSupportApiError);
      expect(error.status).toBe(403);
      expect(error.message).toContain("403");
      expect(error.message).not.toContain("different operator");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(rawBody));
    });
  });
});
