// Payment gateway abstraction for Riwa's Glam.
//
// The rest of the app only deals in a `method` string and a `Payment` row.
// Everything provider-specific (Whish today; card/bank tomorrow) lives HERE, so
// adding a new method later means: add it to PAYMENT_METHODS and add a branch in
// initiatePayment()/parseWebhook() — no schema or checkout rewrite.

import crypto from "node:crypto";

export type PaymentMethod = "CASH" | "WHISH";
export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "WHISH"];
export const isPaymentMethod = (m: string): m is PaymentMethod => (PAYMENT_METHODS as string[]).includes(m);

// Short, human-friendly, unambiguous reference (no O/0/I/1 confusion).
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function genReference(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
  return `RG-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

// ---------------------------------------------------------------------------
// Whish provider (scaffold — wire up once the API credentials arrive).
//
// Expected env vars when connecting:
//   WHISH_BASE_URL         base URL of the Whish API
//   WHISH_CHANNEL / _SECRET / _WEBHOOK_SECRET   auth + webhook verification
// ---------------------------------------------------------------------------
export const whishConfigured = () => !!(process.env.WHISH_BASE_URL && process.env.WHISH_SECRET);

export type WhishInitInput = {
  reference: string;
  amount: number;
  currency: string;
  successUrl: string; // where Whish returns the customer on success
  failureUrl: string; // where Whish returns the customer on failure/cancel
  callbackUrl: string; // our server webhook Whish calls to confirm payment
  customer: { name: string; phone: string; email: string };
};
export type WhishInitResult = {
  ok: boolean;
  redirectUrl?: string; // send the customer here to pay
  providerRef?: string; // Whish's own id for this collection
  error?: string;
};

/** Create a Whish collection and return where to send the customer to pay. */
export async function whishInitiate(input: WhishInitInput): Promise<WhishInitResult> {
  if (!whishConfigured()) return { ok: false, error: "WHISH_NOT_CONFIGURED" };

  // TODO(whish): replace with the real API call once credentials are available:
  //   const r = await fetch(`${process.env.WHISH_BASE_URL}/payment/collect`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHISH_SECRET}` },
  //     body: JSON.stringify({
  //       amount: input.amount, currency: input.currency, externalId: input.reference,
  //       successCallbackUrl: input.successUrl, failureCallbackUrl: input.failureUrl,
  //       callbackUrl: input.callbackUrl, /* + customer fields per Whish spec */
  //     }),
  //   });
  //   const data = await r.json();
  //   return { ok: true, redirectUrl: data.collectUrl, providerRef: String(data.id) };
  return { ok: false, error: "WHISH_NOT_IMPLEMENTED" };
}

/** Verify a webhook really came from Whish before trusting it. */
export function whishVerifyWebhook(headers: Record<string, unknown>, rawBody: string): boolean {
  const secret = process.env.WHISH_WEBHOOK_SECRET || "";
  if (!secret) return false;
  // TODO(whish): switch to the real signature scheme (usually HMAC-SHA256 over the
  // raw body, compared to a header) once documented. Until then, a shared-secret
  // header lets us exercise the full paid→fulfil flow with a simulated webhook.
  void rawBody;
  const provided = String(headers["x-whish-secret"] ?? "");
  if (!provided) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

/** Normalise a Whish webhook body to a common shape the app understands. */
export function whishParseWebhook(body: unknown): { reference: string; success: boolean; txnId: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const status = String(b.status ?? b.collectStatus ?? "").toLowerCase();
  return {
    reference: String(b.reference ?? b.externalId ?? ""),
    success: status === "success" || status === "paid" || status === "completed" || b.success === true,
    txnId: String(b.transactionId ?? b.txnId ?? b.id ?? ""),
  };
}
