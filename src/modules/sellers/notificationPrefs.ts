/**
 * Notification events a seller can turn on or off. `order:status` is not listed:
 * it is part of the order flow and always delivered.
 */
export const SELLER_EVENTS = ["order:new", "stock:low", "review:new"] as const;
export type SellerEvent = (typeof SELLER_EVENTS)[number];
export type NotificationPrefs = Record<SellerEvent, boolean>;

export const DEFAULT_PREFS: NotificationPrefs = {
  "order:new": true,
  "stock:low": true,
  "review:new": true,
};

/** Stored JSON (or null) -> complete preferences. Missing or invalid values fall back to "on". */
export function normalizePrefs(raw: unknown): NotificationPrefs {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_PREFS };
  for (const event of SELLER_EVENTS) {
    if (typeof stored[event] === "boolean") out[event] = stored[event] as boolean;
  }
  return out;
}

/** Only an explicit `false` mutes an event; anything else (including unknown events) is delivered. */
export function isEventEnabled(raw: unknown, event: string): boolean {
  if (!(SELLER_EVENTS as readonly string[]).includes(event)) return true;
  return normalizePrefs(raw)[event as SellerEvent];
}
