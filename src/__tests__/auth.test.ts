import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  prisma: { $connect: vi.fn() },
}));

vi.mock("../tools/crypto.tool", () => ({
  securePass: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
  validatePassHash: vi.fn(),
}));

vi.mock("../tools/jwt.tool", () => ({
  generateAccessToken: vi.fn().mockReturnValue("mock.jwt.token"),
}));

vi.mock("../tools/mailQueue.tool", () => ({
  enqueueMail: vi.fn().mockResolvedValue(undefined),
  mailQueue: {},
  initMailWorker: vi.fn(),
}));

vi.mock("../tools/passwordReset.tool", () => ({
  createResetToken: vi.fn().mockResolvedValue("reset-token-abc"),
  deleteResetToken: vi.fn(),
  getUserIdByResetToken: vi.fn(),
}));

import { registerService, loginService } from "../modules/auth/auth.service";
import prisma from "../config/prisma";
import { securePass, validatePassHash } from "../tools/crypto.tool";
import { generateAccessToken } from "../tools/jwt.tool";

const db = prisma as any;
const mockSecurePass = securePass as ReturnType<typeof vi.fn>;
const mockValidatePass = validatePassHash as ReturnType<typeof vi.fn>;
const mockGenerateToken = generateAccessToken as ReturnType<typeof vi.fn>;

const registerPayload = {
  firstName: "Ana",
  lastName: "García",
  email: "ana@example.com",
  password: "secret123",
  phoneNumber: "5551234",
  phoneCountryCode: "+52",
  country: "México",
  city: "CDMX",
  role: "user" as any,
};

beforeEach(() => vi.clearAllMocks());

describe("registerService", () => {
  it("should register a new user successfully", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "uuid-1",
      email: registerPayload.email,
      firstName: registerPayload.firstName,
      lastName: registerPayload.lastName,
    });

    const result = await registerService(registerPayload);

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/registered/i);
    expect(db.user.create).toHaveBeenCalledOnce();
  });

  it("should reject registration when email is already in use", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing-user" });

    const result = await registerService(registerPayload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already in use/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("should return error when password hashing fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    mockSecurePass.mockResolvedValueOnce(undefined);

    const result = await registerService(registerPayload);

    expect(result.ok).toBe(false);
  });
});

describe("loginService", () => {
  it("should login successfully with valid credentials", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "uuid-1",
      email: "ana@example.com",
      password: "$2b$10$hashedpassword",
      firstName: "Ana",
      lastName: "García",
      role: "user",
      seller: null,
    });
    mockValidatePass.mockResolvedValue(true);

    const result = await loginService({
      email: "ana@example.com",
      password: "secret123",
    });

    expect(result.ok).toBe(true);
    expect((result as any).data?.token).toBe("mock.jwt.token");
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "uuid-1",
        role: "user",
        sellerId: null,
      })
    );
  });

  it("should reject login when user does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const result = await loginService({
      email: "nonexistent@example.com",
      password: "anypass",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid credentials/i);
  });

  it("should reject login when password is wrong", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "uuid-1",
      email: "ana@example.com",
      password: "$2b$10$hashedpassword",
      firstName: "Ana",
      lastName: "García",
    });
    mockValidatePass.mockResolvedValue(false);

    const result = await loginService({
      email: "ana@example.com",
      password: "wrongpassword",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid credentials/i);
  });
});
