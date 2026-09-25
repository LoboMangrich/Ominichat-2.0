import fs from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SARA_FORBIDDEN_OTHER_ACTOR,
  SARA_MEDIA_CONFLICT_MESSAGE,
  SARA_MEDIA_GENERIC_ERROR,
  SARA_MEDIA_MAX_BYTES,
  SARA_UNIDENTIFIED_ACTOR_NOTICE,
  SARA_WINDOW_CLOSED_MESSAGE,
} from "@shared/sara";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { imageBytesMatch, registerSaraMediaRoute } from "./saraMedia";

// A Sara está em produção: nada aqui chama a API real. O fetch GLOBAL é mock (é o que o
// saraSupportClient usa); as requisições para a nossa rota usam o fetch real, guardado
// antes do stub, contra um servidor Express numa porta efêmera.
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

const USER_ID = 7;
const OTHER_ID = 99;
const realFetch = globalThis.fetch;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(200, 1)]);
const AUDIO = Buffer.alloc(500, 7);

let server: Server;
let baseUrl: string;
let saraFetch: ReturnType<typeof vi.fn>;
const originalUrl = ENV.saraSupportApiUrl;
const originalKey = ENV.saraSupportApiKey;

beforeAll(async () => {
  const app = express();
  registerSaraMediaRoute(app);
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

beforeEach(() => {
  ENV.saraSupportApiUrl = "https://sara.example.test";
  ENV.saraSupportApiKey = "test-api-key";
  saraFetch = vi.fn();
  vi.stubGlobal("fetch", saraFetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(sdk.authenticateRequest).mockResolvedValue({ id: USER_ID, role: "Agent", isActive: true } as never);
});

afterEach(() => {
  ENV.saraSupportApiUrl = originalUrl;
  ENV.saraSupportApiKey = originalKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Mensagem do cliente há 1 min: janela de 24h aberta (padrão dos testes). */
function userMessage(agoMs = 60_000) {
  return {
    id: "u1", senderType: "user", text: "", messageType: "text", status: "received",
    createdAt: new Date(Date.now() - agoMs).toISOString(), audio: null, image: null,
  };
}

function conversationDetail(actorId: string | null, messages: unknown[] = [userMessage()]) {
  return {
    conversation: {
      id: "conv-1", status: "human_takeover", outcome: null, phoneNumber: null, userName: null, messageCount: 1,
      lastMessageAt: null, createdAt: "2026-09-24T10:00:00Z", takeoverAdminId: "adm",
      takeoverAt: null, actorId, channelId: null,
    },
    messages,
  };
}

/** Sara: GET da conversa (dono = actorId) e, se chegar lá, a resposta do POST. */
function saraReplies(actorId: string | null, post?: Response) {
  saraFetch.mockResolvedValueOnce(jsonResponse(200, conversationDetail(actorId)));
  if (post) saraFetch.mockResolvedValueOnce(post);
}

function postCalls(): Array<[string, RequestInit]> {
  return saraFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST") as Array<
    [string, RequestInit]
  >;
}

async function upload(kind: string, bytes: Buffer, mimeType: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), "arquivo");
  const res = await realFetch(`${baseUrl}/api/sara/conversations/conv-1/media?kind=${kind}`, {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null };
}

describe("POST /api/sara/conversations/:id/media — repasse para a Sara", () => {
  it("dono envia imagem: POST .../image, multipart campo \"file\", x-sara-actor-id, sem content-type fixo", async () => {
    saraReplies(String(USER_ID), jsonResponse(200, { message: { id: "m1" } }));

    const res = await upload("image", PNG, "image/png");

    expect(res).toEqual({ status: 200, body: { ok: true, messageId: "m1" } });
    const [[url, init]] = postCalls();
    expect(url).toBe("https://sara.example.test/api/v1/support/conversations/conv-1/image");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sara-actor-id"]).toBe(String(USER_ID));
    expect(headers["content-type"]).toBeUndefined(); // o fetch monta com o boundary
    const file = (init.body as FormData).get("file") as File;
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(PNG.length);
    expect(file.name).toBe("image.png"); // nome original não vai para a Sara
  });

  it.each([
    ["JPEG", JPEG, "image/jpeg"],
  ])("aceita imagem %s", async (_label, bytes, mime) => {
    saraReplies(String(USER_ID), jsonResponse(200, { message: { id: "m2" } }));
    expect((await upload("image", bytes, mime)).status).toBe(200);
  });

  it("dono envia áudio webm/opus: POST .../audio", async () => {
    saraReplies(String(USER_ID), jsonResponse(200, { message: { id: "m3" } }));

    const res = await upload("audio", AUDIO, "audio/webm;codecs=opus");

    expect(res.status).toBe(200);
    expect(postCalls()[0][0]).toBe("https://sara.example.test/api/v1/support/conversations/conv-1/audio");
  });
});

describe("tipo/tamanho inválidos — recusados no servidor sem POST para a Sara", () => {
  it.each([
    ["imagem GIF", "image", PNG, "image/gif", 400],
    ["imagem com bytes que não são imagem", "image", AUDIO, "image/png", 400],
    ["áudio com mimetype de imagem", "audio", AUDIO, "image/png", 400],
    ["áudio de 99 bytes", "audio", Buffer.alloc(99, 1), "audio/ogg", 400],
    ["imagem vazia", "image", Buffer.alloc(0), "image/png", 400],
    ["imagem WebP (a Meta não entrega como imagem)", "image", WEBP, "image/webp", 400],
    ["WebP disfarçado de JPEG", "image", WEBP, "image/jpeg", 400],
    ["imagem de 5 MB + 1 byte", "image", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1 - PNG.length)]), "image/png", 400],
  ])("%s → %i", async (_label, kind, bytes, mime, status) => {
    saraReplies(String(USER_ID));
    const res = await upload(kind, bytes, mime);
    expect(res.status).toBe(status);
    expect(res.body?.error).toBeTruthy();
    expect(postCalls()).toHaveLength(0);
  });

  it("arquivo de 16 MB + 1 byte → 413, sem POST", async () => {
    saraReplies(String(USER_ID));
    const res = await upload("audio", Buffer.alloc(SARA_MEDIA_MAX_BYTES + 1, 1), "audio/ogg");
    expect(res).toEqual({ status: 413, body: { error: "Arquivo maior que 16 MB." } });
    expect(postCalls()).toHaveLength(0);
  });

  it("kind inválido → 400 sem chamar a Sara nem para ler", async () => {
    const res = await upload("video", AUDIO, "video/mp4");
    expect(res.status).toBe(400);
    expect(saraFetch).not.toHaveBeenCalled();
  });
});

describe("dono — mesma regra do texto (saraCanSend), checada antes de ler o arquivo", () => {
  it.each([
    ["outro atendente", "Agent"],
    ["Admin (não é exceção)", "Admin"],
  ])("%s → 403 sem POST", async (_label, role) => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ id: USER_ID, role, isActive: true } as never);
    saraReplies(String(OTHER_ID));

    const res = await upload("image", PNG, "image/png");

    expect(res).toEqual({ status: 403, body: { error: SARA_FORBIDDEN_OTHER_ACTOR } });
    expect(postCalls()).toHaveLength(0);
  });

  it("assumida sem identificação (actorId null) → 403 com o aviso próprio", async () => {
    saraReplies(null);
    const res = await upload("image", PNG, "image/png");
    expect(res).toEqual({ status: 403, body: { error: SARA_UNIDENTIFIED_ACTOR_NOTICE } });
    expect(postCalls()).toHaveLength(0);
  });

  it("sem sessão → 401 sem chamar a Sara", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(new Error("sem cookie"));
    const res = await upload("image", PNG, "image/png");
    expect(res.status).toBe(401);
    expect(saraFetch).not.toHaveBeenCalled();
  });
});

describe("erros da Sara viram mensagens certas — sem vazar corpo cru", () => {
  it("400 → motivo devolvido pela Sara (só error.message)", async () => {
    saraReplies(
      String(USER_ID),
      jsonResponse(400, { error: { code: "INVALID_AUDIO", message: "Áudio abaixo do tamanho mínimo" }, debug: "interno" }),
    );
    const res = await upload("audio", AUDIO, "audio/ogg");
    expect(res).toEqual({ status: 400, body: { error: "Áudio abaixo do tamanho mínimo" } });
  });

  it("400 sem motivo legível → mensagem genérica", async () => {
    saraReplies(String(USER_ID), jsonResponse(400, { detalhe: "x" }));
    const res = await upload("audio", AUDIO, "audio/ogg");
    expect(res).toEqual({ status: 400, body: { error: SARA_MEDIA_GENERIC_ERROR } });
  });

  it("409 → \"Assuma a conversa para enviar\"", async () => {
    saraReplies(String(USER_ID), jsonResponse(409, { error: { code: "NOT_CLAIMED", message: "not claimed" } }));
    const res = await upload("image", PNG, "image/png");
    expect(res).toEqual({ status: 409, body: { error: SARA_MEDIA_CONFLICT_MESSAGE } });
  });

  it("500 → genérica, sem o corpo da Sara", async () => {
    saraReplies(String(USER_ID), jsonResponse(500, { error: { code: "X", message: "stack trace interno" } }));
    const res = await upload("image", PNG, "image/png");
    expect(res).toEqual({ status: 502, body: { error: SARA_MEDIA_GENERIC_ERROR } });
  });
});

describe("LGPD — o arquivo não é gravado em disco", () => {
  it("nenhuma escrita em fs no caminho do upload", async () => {
    const spies = [
      vi.spyOn(fs, "writeFile"),
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "createWriteStream"),
      vi.spyOn(fs, "appendFile"),
      vi.spyOn(fs, "appendFileSync"),
      vi.spyOn(fs.promises, "writeFile"),
      vi.spyOn(fs.promises, "appendFile"),
    ];
    saraReplies(String(USER_ID), jsonResponse(200, { message: { id: "m1" } }));

    expect((await upload("image", PNG, "image/png")).status).toBe(200);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("log não traz conteúdo nem nome do arquivo — só status e kind", async () => {
    const errorSpy = vi.mocked(console.error);
    saraReplies(String(OTHER_ID));
    await upload("image", PNG, "image/png");
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("[SaraMedia] recusado 403 kind=image");
    expect(logged).not.toContain("arquivo");
  });
});

describe("imageBytesMatch", () => {
  it("reconhece JPEG e PNG e recusa o resto (inclusive WebP)", () => {
    expect(imageBytesMatch("image/png", PNG)).toBe(true);
    expect(imageBytesMatch("image/jpeg", JPEG)).toBe(true);
    expect(imageBytesMatch("image/webp", WEBP)).toBe(false);
    expect(imageBytesMatch("image/jpeg", WEBP)).toBe(false);
    expect(imageBytesMatch("image/png", JPEG)).toBe(false);
    expect(imageBytesMatch("image/gif", PNG)).toBe(false);
  });
});

describe("janela de 24h do WhatsApp — checada antes de ler o arquivo", () => {
  it("cliente escreveu há mais de 24h → 422 com a mensagem clara, sem POST", async () => {
    saraFetch.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID), [userMessage(25 * 60 * 60 * 1000)])));

    const res = await upload("image", PNG, "image/png");

    expect(res).toEqual({ status: 422, body: { error: SARA_WINDOW_CLOSED_MESSAGE } });
    expect(postCalls()).toHaveLength(0);
  });

  it("nenhuma mensagem do cliente → fora da janela, sem POST", async () => {
    saraFetch.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID), [])));
    const res = await upload("audio", AUDIO, "audio/webm");
    expect(res.status).toBe(422);
    expect(postCalls()).toHaveLength(0);
  });
});
