import { describe, it, expect, vi, beforeEach } from "vitest";

// An in-memory order + products, with a transaction that runs one at a time:
// that is what SELECT ... FOR UPDATE gives the real service.
const world = vi.hoisted(() => {
  const state = {
    order: null as any,
    products: {} as Record<number, { stock: number }>,
    events: [] as any[],
    lock: Promise.resolve() as Promise<unknown>,
  };
  const tx = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async () => (state.order ? structuredClone(state.order) : null)),
      update: vi.fn(async ({ data }: any) => {
        state.order = { ...state.order, ...data };
        return structuredClone(state.order);
      }),
    },
    orderEvent: { create: vi.fn(async ({ data }: any) => void state.events.push(data)) },
    product: {
      update: vi.fn(async ({ where, data }: any) => {
        state.products[where.id].stock += data.stock.increment;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      const run = state.lock.then(() => fn(tx));
      state.lock = run.catch(() => undefined);
      return run;
    }),
  };
  return { state, tx, prisma };
});

vi.mock("../config/prisma", () => ({ default: world.prisma }));
vi.mock("../tools/mail.tool", () => ({ sendOrderConfirmedEmail: vi.fn(), sendOrderStatusEmail: vi.fn() }));
vi.mock("../tools/notify.tool", () => ({ notifyOrderStatus: vi.fn(), notifyPayment: vi.fn() }));

import { checkTransition, TRANSITIONS, nextStatuses } from "../modules/orders/orderStateMachine";
import { cancelOrderService, updateOrderStatusService } from "../modules/orders/orders.service";
import { sendOrderConfirmedEmail, sendOrderStatusEmail } from "../tools/mail.tool";
import { notifyOrderStatus } from "../tools/notify.tool";

const STATUSES = ["pending", "paid", "confirmed", "shipped", "delivered", "cancelled"] as const;

describe("order state machine", () => {
  it("seller: every pair follows the table, nothing else", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const r = checkTransition({ from, to, actor: "seller", reason: "motivo" });
        const allowed = (TRANSITIONS[from] as readonly string[]).includes(to);
        expect(r.ok, `${from} -> ${to}`).toBe(allowed);
        if (!r.ok) expect(r.code).toBe(409);
      }
    }
  });

  it("delivered and cancelled are final for sellers", () => {
    expect(nextStatuses("delivered")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });

  it("does not skip steps nor go back", () => {
    expect(checkTransition({ from: "pending", to: "shipped", actor: "seller" }).ok).toBe(false);
    expect(checkTransition({ from: "pending", to: "delivered", actor: "seller" }).ok).toBe(false);
    expect(checkTransition({ from: "confirmed", to: "pending", actor: "seller" }).ok).toBe(false);
    expect(checkTransition({ from: "delivered", to: "shipped", actor: "seller" }).ok).toBe(false);
  });

  it("a seller cancels from pending, paid and confirmed, never without a reason", () => {
    for (const from of ["pending", "paid", "confirmed"] as const) {
      expect(checkTransition({ from, to: "cancelled", actor: "seller", reason: "Sin stock" }).ok).toBe(true);
      expect(checkTransition({ from, to: "cancelled", actor: "seller" })).toMatchObject({ ok: false, code: 400 });
      expect(checkTransition({ from, to: "cancelled", actor: "seller", reason: "   " })).toMatchObject({ ok: false, code: 400 });
    }
    expect(checkTransition({ from: "shipped", to: "cancelled", actor: "seller", reason: "x" })).toMatchObject({ ok: false, code: 409 });
  });

  it("a buyer can only cancel, and only before the seller confirms", () => {
    expect(checkTransition({ from: "pending", to: "cancelled", actor: "buyer" }).ok).toBe(true);
    expect(checkTransition({ from: "paid", to: "cancelled", actor: "buyer" }).ok).toBe(true);
    for (const from of ["confirmed", "shipped", "delivered", "cancelled"] as const) {
      expect(checkTransition({ from, to: "cancelled", actor: "buyer" })).toMatchObject({ ok: false, code: 409 });
    }
    for (const to of ["paid", "confirmed", "shipped", "delivered"] as const) {
      expect(checkTransition({ from: "pending", to, actor: "buyer" })).toMatchObject({ ok: false, code: 403 });
    }
  });

  it("an admin can force any change and it is flagged", () => {
    expect(checkTransition({ from: "pending", to: "confirmed", actor: "admin" })).toEqual({ ok: true, forced: false });
    expect(checkTransition({ from: "delivered", to: "pending", actor: "admin" })).toEqual({ ok: true, forced: true });
    expect(checkTransition({ from: "pending", to: "pending", actor: "admin" })).toMatchObject({ ok: false, code: 409 });
  });
});

const baseOrder = (status = "pending") => ({
  id: 7,
  userId: "buyer-1",
  sellerId: "stand-1",
  status,
  fulfillment: "pickup",
  user: { id: "buyer-1", email: "buyer@test.com" },
  seller: { id: "stand-1", userId: "seller-user-1" },
  items: [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 5 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  world.state.order = baseOrder();
  world.state.products = { 1: { stock: 8 }, 2: { stock: 0 } };
  world.state.events = [];
  world.state.lock = Promise.resolve();
});

const seller = (status: string, reason?: string, id = "seller-user-1", stand: string | null = "stand-1") =>
  updateOrderStatusService(7, { status, reason } as any, id, "user" as any, stand);

describe("updateOrderStatusService", () => {
  it("moves to the next step, records who/when/from/to and notifies the buyer", async () => {
    const r = await seller("confirmed");

    expect(r.ok).toBe(true);
    expect(world.state.order.status).toBe("confirmed");
    expect(world.state.events).toEqual([
      { orderId: 7, actorId: "seller-user-1", actorRole: "seller", from: "pending", to: "confirmed", reason: null, forced: false },
    ]);
    expect(sendOrderConfirmedEmail).toHaveBeenCalledWith("buyer@test.com", 7, "pickup");
    expect(notifyOrderStatus).toHaveBeenCalledWith("buyer-1", 7, "confirmed", undefined);
    expect(notifyOrderStatus).toHaveBeenCalledTimes(1); // the seller acted: no need to tell them
  });

  it("notifies and emails the buyer on every other status too", async () => {
    world.state.order = baseOrder("confirmed");

    await seller("shipped");

    expect(sendOrderStatusEmail).toHaveBeenCalledWith("buyer@test.com", 7, "shipped", undefined);
    expect(notifyOrderStatus).toHaveBeenCalledWith("buyer-1", 7, "shipped", undefined);
  });

  it("refuses a step that is not allowed with 409 and changes nothing", async () => {
    const r = await seller("shipped");

    expect(r).toMatchObject({ ok: false, code: 409 });
    expect(world.state.order.status).toBe("pending");
    expect(world.state.events).toHaveLength(0);
    expect(notifyOrderStatus).not.toHaveBeenCalled();
  });

  it("refuses any change of a delivered or cancelled order", async () => {
    for (const final of ["delivered", "cancelled"]) {
      world.state.order = baseOrder(final);
      for (const to of STATUSES) {
        expect(await seller(to, "x"), `${final} -> ${to}`).toMatchObject({ ok: false, code: 409 });
      }
    }
    expect(world.state.products[1].stock).toBe(8);
  });

  it("cancelling without a reason is 400 and keeps the stock", async () => {
    const r = await seller("cancelled");

    expect(r).toMatchObject({ ok: false, code: 400 });
    expect(world.state.products[1].stock).toBe(8);
  });

  it("cancelling gives each product its stock back and tells the buyer why", async () => {
    const r = await seller("cancelled", "Se agotó el producto");

    expect(r.ok).toBe(true);
    expect(world.state.products).toEqual({ 1: { stock: 10 }, 2: { stock: 5 } });
    expect(world.state.events[0]).toMatchObject({ to: "cancelled", reason: "Se agotó el producto" });
    expect(sendOrderStatusEmail).toHaveBeenCalledWith("buyer@test.com", 7, "cancelled", "Se agotó el producto");
    expect(notifyOrderStatus).toHaveBeenCalledWith("buyer-1", 7, "cancelled", "Se agotó el producto");
  });

  it("forbids a seller of another stand and writes nothing", async () => {
    const r = await seller("confirmed", undefined, "seller-user-9", "stand-9");

    expect(r).toMatchObject({ ok: false, code: 403 });
    expect(world.state.order.status).toBe("pending");
    expect(world.state.events).toHaveLength(0);
  });

  it("falls back to the seller userId when the token has no sellerId", async () => {
    expect((await seller("confirmed", undefined, "seller-user-1", null)).ok).toBe(true);
    world.state.order = baseOrder();
    expect(await seller("confirmed", undefined, "somebody", null)).toMatchObject({ ok: false, code: 403 });
  });

  it("an admin forces a change, flagged in the history", async () => {
    world.state.order = baseOrder("delivered");

    const r = await updateOrderStatusService(7, { status: "confirmed" } as any, "admin-1", "admin" as any, null);

    expect(r.ok).toBe(true);
    expect(world.state.events[0]).toMatchObject({ actorRole: "admin", from: "delivered", to: "confirmed", forced: true });
  });

  it("a missing order is 404 for an admin", async () => {
    world.state.order = null;

    expect(await updateOrderStatusService(7, { status: "confirmed" } as any, "admin-1", "admin" as any, null))
      .toMatchObject({ ok: false, code: 404 });
  });

  it("a notification failure does not undo the committed change", async () => {
    (notifyOrderStatus as any).mockRejectedValueOnce(new Error("socket down"));

    const r = await seller("confirmed");

    expect(r.ok).toBe(true);
    expect(world.state.order.status).toBe("confirmed");
  });
});

describe("cancelOrderService (buyer)", () => {
  it("cancels a pending order, restocks and tells the seller", async () => {
    const r = await cancelOrderService("buyer-1", 7, "Me equivoqué");

    expect(r.ok).toBe(true);
    expect(world.state.order.status).toBe("cancelled");
    expect(world.state.products).toEqual({ 1: { stock: 10 }, 2: { stock: 5 } });
    expect(world.state.events[0]).toMatchObject({ actorRole: "buyer", actorId: "buyer-1", reason: "Me equivoqué" });
    const notified = (notifyOrderStatus as any).mock.calls.map((c: any[]) => c[0]).sort();
    expect(notified).toEqual(["buyer-1", "seller-user-1"]);
  });

  it("needs no reason", async () => {
    expect((await cancelOrderService("buyer-1", 7)).ok).toBe(true);
  });

  it("cancels a paid order too", async () => {
    world.state.order = baseOrder("paid");
    expect((await cancelOrderService("buyer-1", 7)).ok).toBe(true);
  });

  it("cannot cancel once the seller confirmed", async () => {
    world.state.order = baseOrder("confirmed");

    expect(await cancelOrderService("buyer-1", 7)).toMatchObject({ ok: false, code: 409 });
    expect(world.state.products[1].stock).toBe(8);
  });

  it("cannot cancel an order of someone else (404, nothing written)", async () => {
    expect(await cancelOrderService("intruder", 7)).toMatchObject({ ok: false, code: 404 });
    expect(world.state.order.status).toBe("pending");
    expect(world.state.events).toHaveLength(0);
  });

  it("two cancellations at the same time give the stock back exactly once", async () => {
    const [a, b] = await Promise.all([
      cancelOrderService("buyer-1", 7, "primero"),
      cancelOrderService("buyer-1", 7, "segundo"),
    ]);

    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 409 });
    expect(world.state.products).toEqual({ 1: { stock: 10 }, 2: { stock: 5 } });
    expect(world.state.events).toHaveLength(1);
  });

  it("a buyer cancelling and a seller cancelling at once restock once", async () => {
    const [a, b] = await Promise.all([
      cancelOrderService("buyer-1", 7),
      seller("cancelled", "Sin stock"),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(world.state.products[1].stock).toBe(10);
  });

  it("takes the order row lock before reading it", async () => {
    await cancelOrderService("buyer-1", 7);

    const lock = world.tx.$queryRaw.mock.invocationCallOrder[0];
    const read = world.tx.order.findUnique.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(read);
  });
});
