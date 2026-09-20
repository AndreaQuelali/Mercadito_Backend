import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import {
  createUserService,
  getUserProfileService,
  getUsersService,
  getUserByIdService,
  updateUserService,
  deleteUserService,
} from "../modules/users/users.service";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => vi.resetAllMocks());

describe("createUserService", () => {
  it("rejects a duplicated email", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1" });

    const result = await createUserService({ email: "a@b.com" } as any);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already in use/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("defaults the role to user and never selects the password", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });

    const result = await createUserService({ email: "a@b.com" } as any);

    expect(result.ok).toBe(true);
    const args = db.user.create.mock.calls[0][0];
    expect(args.data.role).toBe("user");
    expect(args.select.password).toBeUndefined();
  });

  it("keeps an explicit role", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });

    await createUserService({ email: "a@b.com", role: "admin" } as any);

    expect(db.user.create.mock.calls[0][0].data.role).toBe("admin");
  });
});

describe("getUserProfileService / getUserByIdService", () => {
  it("returns the profile without the password", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1" });

    const result = await getUserProfileService("u1");

    expect(result.ok).toBe(true);
    expect(db.user.findUnique.mock.calls[0][0].select.password).toBeUndefined();
  });

  it("returns not found for an unknown profile", async () => {
    db.user.findUnique.mockResolvedValue(null);

    expect((await getUserProfileService("x")).ok).toBe(false);
  });

  it("returns not found for an unknown id", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const result = await getUserByIdService("x");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("getUsersService", () => {
  it("builds case-insensitive filters and caps results at 100", async () => {
    db.user.findMany.mockResolvedValue([{ id: "u1" }]);

    const result = await getUsersService({
      firstName: "an",
      role: "admin",
      city: "La Paz",
    } as any);

    expect(result.ok).toBe(true);
    const args = db.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      firstName: { contains: "an", mode: "insensitive" },
      role: "admin",
      city: { contains: "La Paz", mode: "insensitive" },
    });
    expect(args.take).toBe(100);
    expect(args.select.password).toBeUndefined();
  });

  it("returns not found when nothing matches", async () => {
    db.user.findMany.mockResolvedValue([]);

    const result = await getUsersService({} as any);

    expect(result.ok).toBe(false);
  });
});

describe("updateUserService", () => {
  it("rejects an email used by another user", async () => {
    db.user.findFirst.mockResolvedValue({ id: "other" });

    const result = await updateUserService("u1", { email: "taken@b.com" } as any);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already used/i);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({
      email: "taken@b.com",
      NOT: { id: "u1" },
    });
  });

  it("updates the user when there is no conflict", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockResolvedValue({ id: "u1", city: "Oruro" });

    const result = await updateUserService("u1", { city: "Oruro" } as any);

    expect(result.ok).toBe(true);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("maps P2025 to 'User not found'", async () => {
    db.user.update.mockRejectedValue({ code: "P2025" });

    const result = await updateUserService("x", { city: "a" } as any);

    expect(result.message).toBe("User not found");
  });

  it("returns a generic error for other failures", async () => {
    db.user.update.mockRejectedValue(new Error("boom"));

    const result = await updateUserService("x", { city: "a" } as any);

    expect(result.message).toBe("Error updating user");
  });
});

describe("deleteUserService", () => {
  it("deletes and returns the user without password", async () => {
    db.user.delete.mockResolvedValue({ id: "u1" });

    const result = await deleteUserService("u1");

    expect(result.ok).toBe(true);
    expect(db.user.delete.mock.calls[0][0].select.password).toBeUndefined();
  });

  it("maps P2025 to 'User not found'", async () => {
    db.user.delete.mockRejectedValue({ code: "P2025" });

    expect((await deleteUserService("x")).message).toBe("User not found");
  });
});
