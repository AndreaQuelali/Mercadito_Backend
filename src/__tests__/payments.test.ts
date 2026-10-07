import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    order: { findFirst: vi.fn(), update: vi.fn() },
    seller: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../tools/mail.tool", () => ({ sendOrderConfirmedEmail: vi.fn() }));
vi.mock("../tools/notify.tool", () => ({ notifyOrderStatus: vi.fn(), notifyPayment: vi.fn() }));

import {
  canConfirmPayment,
  canRejectPayment,
  canUploadProof,
  statusAfterPayment,
} from "../modules/orders/payment.rules";
import { PaymentProofSchema, UpdatePaymentSchema } from "../modules/orders/schemas/payment.schema";
import { updatePaymentService, uploadPaymentProofService } from "../modules/orders/orders.service";
import { updateMySellerService } from "../modules/sellers/sellers.service";
import { notifyPayment } from "../tools/notify.tool";
import prisma from "../config/prisma";

const db = prisma as any;
const state = (o: Partial<any> = {}) => ({
  status: "pending",
  paymentMethod: "qr_transfer",
  paymentStatus: "unpaid",
  ...o,
});

beforeEach(() => vi.resetAllMocks());

describe("payment transitions", () => {
  it("uploads a proof for an unpaid or rejected QR order", () => {
    expect(canUploadProof(state() as any).ok).toBe(true);
    expect(canUploadProof(state({ paymentStatus: "rejected" }) as any).ok).toBe(true);
  });

  it("refuses a proof for cash, paid, already-waiting or cancelled orders", () => {
    expect(canUploadProof(state({ paymentMethod: "cash_on_delivery" }) as any).ok).toBe(false);
    expect(canUploadProof(state({ paymentStatus: "paid" }) as any).ok).toBe(false);
    expect(canUploadProof(state({ paymentStatus: "proof_uploaded" }) as any).ok).toBe(false);
    expect(canUploadProof(state({ status: "cancelled" }) as any).ok).toBe(false);
  });

  it("confirms a QR order only with a proof waiting", () => {
    expect(canConfirmPayment(state({ paymentStatus: "proof_uploaded" }) as any).ok).toBe(true);
    expect(canConfirmPayment(state() as any).ok).toBe(false);
    expect(canConfirmPayment(state({ paymentStatus: "rejected" }) as any).ok).toBe(false);
  });

  it("confirms a cash order while unpaid, once", () => {
    const cash = { paymentMethod: "cash_on_delivery" };
    expect(canConfirmPayment(state(cash) as any).ok).toBe(true);
    expect(canConfirmPayment(state({ ...cash, paymentStatus: "paid" }) as any).ok).toBe(false);
  });

  it("refuses to confirm or reject a cancelled order", () => {
    const cancelled = state({ status: "cancelled", paymentStatus: "proof_uploaded" }) as any;
    expect(canConfirmPayment(cancelled).ok).toBe(false);
    expect(canRejectPayment(cancelled).ok).toBe(false);
  });

  it("rejects only a proof waiting for review", () => {
    expect(canRejectPayment(state({ paymentStatus: "proof_uploaded" }) as any).ok).toBe(true);
    expect(canRejectPayment(state() as any).ok).toBe(false);
    expect(canRejectPayment(state({ paymentStatus: "paid" }) as any).ok).toBe(false);
  });

  it("moves only a pending order to paid", () => {
    expect(statusAfterPayment("pending")).toBe("paid");
    expect(statusAfterPayment("shipped")).toBe("shipped");
    expect(statusAfterPayment("delivered")).toBe("delivered");
  });
});

describe("payment schemas", () => {
  it("requires a valid URL for the proof", () => {
    expect(PaymentProofSchema.safeParse({ url: "https://x.com/p.jpg" }).success).toBe(true);
    expect(PaymentProofSchema.safeParse({ url: "no-url" }).success).toBe(false);
    expect(PaymentProofSchema.safeParse({}).success).toBe(false);
  });

  it("requires a reason to reject, not to confirm", () => {
    expect(UpdatePaymentSchema.safeParse({ action: "confirm" }).success).toBe(true);
    expect(UpdatePaymentSchema.safeParse({ action: "reject" }).success).toBe(false);
    expect(UpdatePaymentSchema.safeParse({ action: "reject", reason: "  " }).success).toBe(false);
    expect(UpdatePaymentSchema.safeParse({ action: "reject", reason: "Monto distinto" }).success).toBe(true);
    expect(UpdatePaymentSchema.safeParse({ action: "refund" }).success).toBe(false);
  });
});

describe("uploadPaymentProofService", () => {
  const order = (o: Partial<any> = {}) => ({
    id: 5, userId: "buyer", total: 40, ...state(), seller: { userId: "seller-user" }, ...o,
  });

  it("only looks up the buyer own order", async () => {
    db.order.findFirst.mockResolvedValue(null);

    const r = await uploadPaymentProofService("intruder", 5, { url: "https://x.com/p.jpg" });

    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 5, userId: "intruder" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found/i);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("stores the proof, clears the old reason and tells the seller", async () => {
    db.order.findFirst.mockResolvedValue(order({ paymentStatus: "rejected" }));
    db.order.update.mockResolvedValue({ id: 5 });

    const r = await uploadPaymentProofService("buyer", 5, { url: "https://x.com/p.jpg" });

    expect(r.ok).toBe(true);
    expect(db.order.update.mock.calls[0][0].data).toEqual({
      paymentStatus: "proof_uploaded",
      paymentProofUrl: "https://x.com/p.jpg",
      paymentRejectReason: null,
    });
    expect(notifyPayment).toHaveBeenCalledWith("seller-user", "payment:proof", 5, { total: "40" });
  });

  it("answers a conflict for a cash order and writes nothing", async () => {
    db.order.findFirst.mockResolvedValue(order({ paymentMethod: "cash_on_delivery" }));

    const r = await uploadPaymentProofService("buyer", 5, { url: "https://x.com/p.jpg" });

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Conflict/);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(notifyPayment).not.toHaveBeenCalled();
  });
});

describe("updatePaymentService", () => {
  const waiting = { id: 5, userId: "buyer", ...state({ paymentStatus: "proof_uploaded" }) };

  it("forbids a seller from another stand and writes nothing", async () => {
    db.order.findFirst.mockResolvedValue(null);

    const r = await updatePaymentService(5, { action: "confirm" }, "u9", "user" as any, "stand-9");

    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 5, sellerId: "stand-9" });
    expect(r.message).toMatch(/^Forbidden/);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("falls back to the seller userId when the token has no sellerId", async () => {
    db.order.findFirst.mockResolvedValue(null);

    await updatePaymentService(5, { action: "confirm" }, "u1", "user" as any, null);

    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 5, seller: { userId: "u1" } });
  });

  it("confirming marks it paid, moves pending to paid and tells the buyer", async () => {
    db.order.findFirst.mockResolvedValue(waiting);
    db.order.update.mockResolvedValue({ id: 5 });

    const r = await updatePaymentService(5, { action: "confirm" }, "u1", "user" as any, "stand-1");

    expect(r.ok).toBe(true);
    const data = db.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ paymentStatus: "paid", status: "paid", paymentRejectReason: null });
    expect(data.paidAt).toBeInstanceOf(Date);
    expect(notifyPayment).toHaveBeenCalledWith("buyer", "payment:confirmed", 5);
  });

  it("confirming keeps a later status (cash collected on delivery)", async () => {
    db.order.findFirst.mockResolvedValue({
      id: 5,
      userId: "buyer",
      ...state({ paymentMethod: "cash_on_delivery", status: "shipped" }),
    });
    db.order.update.mockResolvedValue({ id: 5 });

    await updatePaymentService(5, { action: "confirm" }, "u1", "user" as any, "stand-1");

    expect(db.order.update.mock.calls[0][0].data.status).toBe("shipped");
  });

  it("rejecting stores the reason, keeps the status and tells the buyer why", async () => {
    db.order.findFirst.mockResolvedValue(waiting);
    db.order.update.mockResolvedValue({ id: 5 });

    const r = await updatePaymentService(
      5,
      { action: "reject", reason: "Monto distinto" },
      "u1",
      "user" as any,
      "stand-1"
    );

    expect(r.ok).toBe(true);
    expect(db.order.update.mock.calls[0][0].data).toEqual({
      paymentStatus: "rejected",
      paymentRejectReason: "Monto distinto",
    });
    expect(notifyPayment).toHaveBeenCalledWith("buyer", "payment:rejected", 5, { reason: "Monto distinto" });
  });

  it("answers a conflict when there is no proof to confirm", async () => {
    db.order.findFirst.mockResolvedValue({ id: 5, userId: "buyer", ...state() });

    const r = await updatePaymentService(5, { action: "confirm" }, "u1", "user" as any, "stand-1");

    expect(r.message).toMatch(/^Conflict/);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(notifyPayment).not.toHaveBeenCalled();
  });

  it("lets an admin act on any order", async () => {
    db.order.findFirst.mockResolvedValue(waiting);
    db.order.update.mockResolvedValue({ id: 5 });

    await updatePaymentService(5, { action: "confirm" }, "admin", "admin" as any, null);

    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 5 });
  });
});

describe("updateMySellerService — payment data", () => {
  const stand = {
    id: "s1",
    userId: "u1",
    acceptsCash: true,
    acceptsQr: false,
    paymentQrUrl: null,
    paymentInstructions: null,
  };

  it("refuses to accept QR without a QR image or instructions", async () => {
    db.seller.findUnique.mockResolvedValue(stand);

    const r = await updateMySellerService("u1", { acceptsQr: true });

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/QR/);
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it("accepts QR with instructions, and clears an empty QR URL", async () => {
    db.seller.findUnique.mockResolvedValue(stand);
    db.seller.update.mockResolvedValue({ id: "s1" });

    const r = await updateMySellerService("u1", {
      acceptsQr: true,
      paymentInstructions: "Banco X, cuenta 123",
      paymentQrUrl: "",
    });

    expect(r.ok).toBe(true);
    expect(db.seller.update.mock.calls[0][0].data).toEqual({
      acceptsQr: true,
      paymentInstructions: "Banco X, cuenta 123",
      paymentQrUrl: null,
    });
  });

  it("refuses to turn every method off", async () => {
    db.seller.findUnique.mockResolvedValue(stand);

    const r = await updateMySellerService("u1", { acceptsCash: false });

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/at least one/i);
  });

  it("allows QR only when instructions already exist", async () => {
    db.seller.findUnique.mockResolvedValue({ ...stand, acceptsQr: true, paymentInstructions: "Cuenta 1" });
    db.seller.update.mockResolvedValue({ id: "s1" });

    const r = await updateMySellerService("u1", { acceptsCash: false });

    expect(r.ok).toBe(true);
  });
});

describe("UpdateSellerSchema — payment data", () => {
  it("keeps the payment fields instead of stripping them", async () => {
    const { UpdateSellerSchema } = await import("../modules/sellers/schemas/seller.schema");
    const parsed = UpdateSellerSchema.safeParse({
      acceptsCash: false,
      acceptsQr: true,
      paymentQrUrl: "https://x.com/qr.png",
      paymentInstructions: "Cuenta 1",
    });
    expect(parsed.success && parsed.data).toMatchObject({
      acceptsCash: false,
      acceptsQr: true,
      paymentQrUrl: "https://x.com/qr.png",
      paymentInstructions: "Cuenta 1",
    });
  });

  it("rejects instructions over 500 characters and a non-URL QR", async () => {
    const { UpdateSellerSchema } = await import("../modules/sellers/schemas/seller.schema");
    expect(UpdateSellerSchema.safeParse({ paymentInstructions: "x".repeat(501) }).success).toBe(false);
    expect(UpdateSellerSchema.safeParse({ paymentQrUrl: "no-url" }).success).toBe(false);
    expect(UpdateSellerSchema.safeParse({ paymentQrUrl: "" }).success).toBe(true);
  });
});
