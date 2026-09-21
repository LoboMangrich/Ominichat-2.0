import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { hashPassword } from "./passwordHash";

vi.mock("../db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

import * as db from "../db";
import { handleLogin, loginRateLimitKey, normalizeEmail } from "./passwordAuth";

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "atendente@reinoeducacao.com",
    name: "Atendente Teste",
    email: "atendente@reinoeducacao.com",
    loginMethod: "password",
    role: "Agent",
    avatarUrl: null,
    passwordHash: "",
    mustChangePassword: false,
    isActive: true,
    approvedAt: new Date(),
    approvedBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function fakeReq(body: unknown, ip = "203.0.113.10"): Request {
  return { body, ip, protocol: "https", headers: {} } as unknown as Request;
}

function fakeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
}

describe("passwordAuth", () => {
  const originalCookieSecret = ENV.cookieSecret;

  beforeEach(() => {
    ENV.cookieSecret = "chave-de-teste-so-para-vitest-0123456789";
    vi.mocked(db.getUserByOpenId).mockReset();
    vi.mocked(db.upsertUser).mockReset();
  });

  afterEach(() => {
    ENV.cookieSecret = originalCookieSecret;
  });

  describe("normalizeEmail", () => {
    it("remove espaços e baixa a caixa", () => {
      expect(normalizeEmail("  Atendente@ReinoEducacao.com  ")).toBe("atendente@reinoeducacao.com");
    });
  });

  describe("loginRateLimitKey", () => {
    it("combina IP e e-mail normalizado", () => {
      const req = fakeReq({ email: "  Foo@Bar.com " }, "1.2.3.4");
      expect(loginRateLimitKey(req)).toBe("1.2.3.4:foo@bar.com");
    });

    it("não quebra quando o body não tem e-mail (ainda limita por IP)", () => {
      const req = fakeReq({}, "1.2.3.4");
      expect(loginRateLimitKey(req)).toBe("1.2.3.4:sem-email");
    });
  });

  describe("handleLogin", () => {
    it("credenciais corretas: seta cookie de sessão e devolve success", async () => {
      const hash = await hashPassword("senha-correta-123");
      vi.mocked(db.getUserByOpenId).mockResolvedValue(
        fakeUser({ passwordHash: hash, mustChangePassword: true })
      );

      const req = fakeReq({ email: "Atendente@reinoeducacao.com", password: "senha-correta-123" });
      const res = fakeRes();
      await handleLogin(req, res);

      expect(res.cookie).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, mustChangePassword: true })
      );
      expect(db.upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({ openId: "atendente@reinoeducacao.com" })
      );
    });

    it("senha errada: 401 com mensagem genérica, sem cookie", async () => {
      const hash = await hashPassword("senha-correta-123");
      vi.mocked(db.getUserByOpenId).mockResolvedValue(fakeUser({ passwordHash: hash }));

      const req = fakeReq({ email: "atendente@reinoeducacao.com", password: "senha-errada" });
      const res = fakeRes();
      await handleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "E-mail ou senha inválidos" });
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it("e-mail inexistente: mesma mensagem genérica de senha errada (não revela se a conta existe)", async () => {
      vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);

      const req = fakeReq({ email: "ninguem@reinoeducacao.com", password: "qualquer-coisa" });
      const res = fakeRes();
      await handleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "E-mail ou senha inválidos" });
    });

    it("conta desativada: mesma mensagem genérica, mesmo com a senha certa", async () => {
      const hash = await hashPassword("senha-correta-123");
      vi.mocked(db.getUserByOpenId).mockResolvedValue(
        fakeUser({ passwordHash: hash, isActive: false })
      );

      const req = fakeReq({ email: "atendente@reinoeducacao.com", password: "senha-correta-123" });
      const res = fakeRes();
      await handleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "E-mail ou senha inválidos" });
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it("body sem e-mail ou senha: 400, não chega a consultar o banco", async () => {
      const req = fakeReq({ email: "atendente@reinoeducacao.com" });
      const res = fakeRes();
      await handleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(db.getUserByOpenId).not.toHaveBeenCalled();
    });
  });
});
