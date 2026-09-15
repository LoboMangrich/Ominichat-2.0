import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";
import { requireEmailTicketSecret } from "./routeGuards";

// Achado de segurança: /api/webhooks/email-ticket não tinha nenhum guard — a Story 1.1
// (webhook-signature-validation) cobriu WhatsApp/Instagram/Telegram e deixou esse endpoint
// fora do escopo sem justificativa registrada. requireEmailTicketSecret corrige isso,
// aceitando header x-email-ticket-secret (preferencial) ou token no path (:token), fail-closed
// sem EMAIL_TICKET_SECRET configurado.

function fakeReq(headers: Record<string, string>, params: Record<string, string> = {}): Request {
  return { headers, params } as unknown as Request;
}

function fakeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireEmailTicketSecret", () => {
  const originalSecret = ENV.emailTicketSecret;

  afterEach(() => {
    ENV.emailTicketSecret = originalSecret;
  });

  it("header correto libera", async () => {
    ENV.emailTicketSecret = "correct-secret";
    const req = fakeReq({ "x-email-ticket-secret": "correct-secret" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("header errado nega com 401", async () => {
    ENV.emailTicketSecret = "correct-secret";
    const req = fakeReq({ "x-email-ticket-secret": "wrong-secret" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("token correto no path libera", async () => {
    ENV.emailTicketSecret = "correct-secret";
    const req = fakeReq({}, { token: "correct-secret" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("token errado no path nega com 401", async () => {
    ENV.emailTicketSecret = "correct-secret";
    const req = fakeReq({}, { token: "wrong-token" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("sem header nem token nega com 401", async () => {
    ENV.emailTicketSecret = "correct-secret";
    const req = fakeReq({});
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("falha fechado quando EMAIL_TICKET_SECRET não está configurado, mesmo com header correto", async () => {
    ENV.emailTicketSecret = "";
    const req = fakeReq({ "x-email-ticket-secret": "qualquer-coisa" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("falha fechado quando EMAIL_TICKET_SECRET não está configurado, mesmo com token correto no path", async () => {
    ENV.emailTicketSecret = "";
    const req = fakeReq({}, { token: "qualquer-coisa" });
    const res = fakeRes();
    const next: NextFunction = vi.fn();

    await requireEmailTicketSecret(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
