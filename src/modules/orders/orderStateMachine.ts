import { OrderStatus } from "@prisma/client";

export type OrderActor = "buyer" | "seller" | "admin";

/** Steps a seller can take. `delivered` and `cancelled` are final. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "confirmed", "cancelled"],
  paid: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** States from which the buyer can still cancel (before the seller confirms). */
export const BUYER_CANCELLABLE: readonly OrderStatus[] = ["pending", "paid"];

export type TransitionCheck =
  | { ok: true; forced: boolean }
  | { ok: false; code: 400 | 403 | 409; message: string };

const deny = (code: 400 | 403 | 409, message: string): TransitionCheck => ({ ok: false, code, message });

/** Next steps a seller can offer for an order in this status. */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * Pure rule of the order lifecycle: who can move an order from `from` to `to`.
 * - 403: the actor's role never allows that change (a buyer can only cancel)
 * - 409: the order is in a state that does not allow it
 * - 400: a seller cancels without a reason
 * An admin can force any change; `forced` is true when the table would have refused it.
 */
export function checkTransition(input: {
  from: OrderStatus;
  to: OrderStatus;
  actor: OrderActor;
  reason?: string | null;
}): TransitionCheck {
  const { from, to, actor } = input;
  const reason = input.reason?.trim();

  if (from === to) return deny(409, `The order is already ${from}`);

  if (actor === "admin") return { ok: true, forced: !TRANSITIONS[from].includes(to) };

  if (actor === "buyer") {
    if (to !== "cancelled") return deny(403, "Forbidden: a buyer can only cancel an order");
    if (!BUYER_CANCELLABLE.includes(from)) {
      return deny(409, `Conflict: an order that is ${from} can no longer be cancelled by the buyer`);
    }
    return { ok: true, forced: false };
  }

  if (!TRANSITIONS[from].includes(to)) {
    return deny(409, `Conflict: an order cannot go from ${from} to ${to}`);
  }
  if (to === "cancelled" && !reason) return deny(400, "A reason is required to cancel an order");
  return { ok: true, forced: false };
}
