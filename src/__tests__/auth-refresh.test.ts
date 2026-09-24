import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../config/prisma", () => ({
  default: { user: { findUnique: vi.fn(), create: vi.fn() } },
  prisma: { $connect: vi.fn() },
}));
vi.mock("../tools/crypto.tool", () => ({
  securePass: vi.fn(),
  validatePassHash: vi.fn(),
}));
vi.mock("../tools/mailQueue.tool", () => ({ enqueueMail: vi.fn(), mailQueue: {}, initMailWorker: vi.fn() }));
vi.mock("../tools/passwordReset.tool", () => ({
  createResetToken: vi.fn(),
  deleteResetToken: vi.fn(),
  getUserIdByResetToken: vi.fn(),
}));
vi.mock("../tools/refreshToken.tool", () => ({
  issueRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

import { loginService, refreshService, logoutService } from "../modules/auth/auth.service";
import authRouter from "../modules/auth/auth.routes";
import { generateAccessToken } from "../tools/jwt.tool";
import { validateSesionUser } from "../middleware/userSesion.middleware";
import { validatePassHash } from "../tools/crypto.tool";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../tools/refreshToken.tool";
import { ENV } from "../config/env.config";
import prisma from "../config/prisma";

const db = prisma as any;
const dbUser = {
  id: "u1",
  email: "a@b.com",
  firstName: "Ana",
  lastName: "Perez",
  role: "user",
  password: "hash",
  seller: { id: "seller-1" },
};

beforeEach(() => vi.resetAllMocks());

describe("access token lifetime", () => {
  it("expires in 15 minutes by default", () => {
    const token = generateAccessToken({
      name: "Ana",
      email: "a@b.com",
      sub: "u1",
      role: "user" as any,
      sellerId: null,
    });

    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };

    expect(ENV.ACCESS_TOKEN_TTL).toBe("15m");
    expect(exp - iat).toBe(15 * 60);
  });
});

describe("loginService → refresh token", () => {
  it("returns an access token and a refresh token", async () => {
    db.user.findUnique.mockResolvedValue(dbUser);
    (validatePassHash as any).mockResolvedValue(true);
    (issueRefreshToken as any).mockResolvedValue("refresh-1");

    const result = await loginService({ email: "a@b.com", password: "x" } as any);

    expect(result.ok).toBe(true);
    expect((result.data as any).refreshToken).toBe("refresh-1");
    expect(typeof (result.data as any).token).toBe("string");
    expect(issueRefreshToken).toHaveBeenCalledWith("u1");
  });

  it("does not issue a refresh token for bad credentials", async () => {
    db.user.findUnique.mockResolvedValue(dbUser);
    (validatePassHash as any).mockResolvedValue(false);

    const result = await loginService({ email: "a@b.com", password: "bad" } as any);

    expect(result.ok).toBe(false);
    expect(issueRefreshToken).not.toHaveBeenCalled();
  });
});

describe("refreshService", () => {
  it("rotates the token and builds the access token from fresh user data", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: true, userId: "u1", token: "refresh-2" });
    db.user.findUnique.mockResolvedValue({ ...dbUser, role: "admin", seller: { id: "seller-9" } });

    const result = await refreshService("refresh-1");

    expect(result.ok).toBe(true);
    const data = result.data as any;
    expect(data.refreshToken).toBe("refresh-2");
    const claims = jwt.decode(data.token) as any;
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("admin");
    expect(claims.sellerId).toBe("seller-9");
  });

  it("answers 401 for an invalid token", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: false, reason: "invalid" });

    const result = await refreshService("nope");

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("answers 401 with the same message for a reused token", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: false, reason: "reused" });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const invalid = await (async () => {
      (rotateRefreshToken as any).mockResolvedValueOnce({ ok: false, reason: "invalid" });
      return refreshService("a");
    })();
    const reused = await refreshService("b");

    expect(reused).toMatchObject({ ok: false, status: 401 });
    expect(reused.message).toBe(invalid.message);
  });

  it("revokes the new token and answers 401 when the user no longer exists", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: true, userId: "gone", token: "refresh-2" });
    db.user.findUnique.mockResolvedValue(null);

    const result = await refreshService("refresh-1");

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(revokeRefreshToken).toHaveBeenCalledWith("refresh-2");
  });

  it("answers 500 (not 401) when the infrastructure fails, so clients keep their session", async () => {
    (rotateRefreshToken as any).mockRejectedValue(new Error("redis down"));

    const result = await refreshService("refresh-1");

    expect(result).toMatchObject({ ok: false, status: 500 });
  });
});

describe("logoutService", () => {
  it("revokes the refresh token", async () => {
    const result = await logoutService("refresh-1");

    expect(result.ok).toBe(true);
    expect(revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
  });

  it("is ok even when revoking fails (idempotent logout)", async () => {
    (revokeRefreshToken as any).mockRejectedValue(new Error("redis down"));

    const result = await logoutService("refresh-1");

    expect(result.ok).toBe(true);
  });
});

describe("auth routes: /auth/refresh and /auth/logout", () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);

  it("POST /auth/refresh without a body is a 400", async () => {
    const res = await request(app).post("/auth/refresh").send({});

    expect(res.status).toBe(400);
  });

  it("POST /auth/refresh returns the new token pair", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: true, userId: "u1", token: "refresh-2" });
    db.user.findUnique.mockResolvedValue(dbUser);

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "refresh-1" });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBe("refresh-2");
    expect(typeof res.body.data.token).toBe("string");
  });

  it("POST /auth/refresh answers 401 for an invalid token", async () => {
    (rotateRefreshToken as any).mockResolvedValue({ ok: false, reason: "invalid" });

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "nope" });

    expect(res.status).toBe(401);
  });

  it("POST /auth/refresh answers 500 on infrastructure failure", async () => {
    (rotateRefreshToken as any).mockRejectedValue(new Error("redis down"));

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "x" });

    expect(res.status).toBe(500);
  });

  it("POST /auth/logout revokes the refresh token", async () => {
    const res = await request(app).post("/auth/logout").send({ refreshToken: "refresh-1" });

    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
  });

  it("POST /auth/logout without a refresh token is a 400", async () => {
    const res = await request(app).post("/auth/logout").send({});

    expect(res.status).toBe(400);
  });
});

describe("validateSesionUser with expiring access tokens", () => {
  const app = express();
  app.get("/protected", validateSesionUser, (req, res) => {
    res.status(200).send({ sub: req.user.sub });
  });
  const sign = (opts: jwt.SignOptions) =>
    jwt.sign({ sub: "u1" }, ENV.JWT_SECRET, { algorithm: "HS256", ...opts });

  it("accepts a fresh access token", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${sign({ expiresIn: "15m" })}`);

    expect(res.status).toBe(200);
  });

  it("rejects an expired access token with 401", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${sign({ expiresIn: -5 })}`);

    expect(res.status).toBe(401);
  });
});
