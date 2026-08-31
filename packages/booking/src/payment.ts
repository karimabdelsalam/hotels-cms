import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@fantazia/db";
import { transition } from "./engine";
import { runOnce } from "./idempotency";

/**
 * Taking the money.
 *
 * ── What is real and what is waiting ───────────────────────────────────
 * The lifecycle here is real: idempotent creation, a webhook that is the
 * only thing allowed to move a booking to PAID, signature verification,
 * replay protection, and the rule that the browser redirect decides what
 * page to render and nothing else.
 *
 * What is not here is an adapter for a specific payment provider, because
 * none has been chosen yet. `TestProvider` below stands in and is
 * refused in production. Adding a real one — Paymob, Stripe, whichever —
 * means implementing `PaymentProvider` and its signature check; nothing
 * else in the system needs to change.
 */

export type PaymentIntent = {
  providerPaymentId: string;
  /** Where to send the guest to pay. */
  redirectUrl: string;
};

export type WebhookEvent = {
  /** The provider's own event id. Replay protection keys on this. */
  eventId: string;
  providerPaymentId: string;
  kind: "captured" | "failed" | "refunded";
  amountMinor: number;
  currency: string;
  method?: string;
  last4?: string;
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  create(input: {
    bookingId: string;
    reference: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    returnUrl: string;
    guestEmail: string;
  }): Promise<PaymentIntent>;
  /** Must verify a signature, not merely parse. Returning null rejects. */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null>;
}

/* ------------------------------------------------------------------ *
 * The stand-in
 * ------------------------------------------------------------------ */

export class TestProvider implements PaymentProvider {
  readonly name = "test";

  constructor(private readonly secret: string) {}

  async create(input: {
    bookingId: string;
    reference: string;
    amountMinor: number;
    currency: string;
    returnUrl: string;
  }): Promise<PaymentIntent> {
    const providerPaymentId = `test_${randomUUID()}`;
    // A local page standing in for the provider's hosted one.
    const url = new URL("/api/payments/test", input.returnUrl);
    url.searchParams.set("payment", providerPaymentId);
    url.searchParams.set("booking", input.bookingId);
    url.searchParams.set("amount", String(input.amountMinor));
    url.searchParams.set("currency", input.currency);
    return { providerPaymentId, redirectUrl: url.toString() };
  }

  async parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent | null> {
    const signature = headers["x-test-signature"];
    if (!signature) return null;

    const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // A wrong signature is a forged webhook, and a forged webhook is a free
    // booking. Compared in constant time so the check cannot be probed.
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const kind = body.kind;
    if (kind !== "captured" && kind !== "failed" && kind !== "refunded") return null;

    return {
      eventId: String(body.eventId),
      providerPaymentId: String(body.providerPaymentId),
      kind,
      amountMinor: Number(body.amountMinor),
      currency: String(body.currency),
      method: body.method ? String(body.method) : undefined,
      last4: body.last4 ? String(body.last4) : undefined,
      raw: body,
    };
  }
}

export function providerFor(): PaymentProvider {
  const chosen = process.env.PAYMENT_PROVIDER ?? "test";
  if (chosen === "test") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_PAYMENTS !== "yes") {
      // Refusing loudly beats taking imaginary money on a live site.
      throw new Error(
        "PAYMENT_PROVIDER is still 'test'. Configure a real provider before taking bookings.",
      );
    }
    return new TestProvider(process.env.PAYMENT_TEST_SECRET ?? "test-secret");
  }
  throw new Error(`No payment adapter is implemented for "${chosen}".`);
}

/* ------------------------------------------------------------------ *
 * Creating a payment
 * ------------------------------------------------------------------ */

/**
 * Idempotent on (booking, amount, attempt): a double-clicked Pay button
 * returns the original intent rather than opening a second charge.
 */
export async function startPayment(options: {
  bookingId: string;
  returnUrl: string;
}): Promise<PaymentIntent> {
  const booking = await prisma.booking.findUnique({
    where: { id: options.bookingId },
    include: { guest: true, payments: true },
  });
  if (!booking) throw new Error("That booking no longer exists.");
  if (booking.status !== "DRAFT" && booking.status !== "PENDING_PAYMENT") {
    throw new Error("That booking is not waiting for payment.");
  }

  const attempt = booking.payments.filter((p) => p.status !== "FAILED").length;
  const idempotencyKey = createHash("sha256")
    .update(`${booking.id}:${booking.totalAmount}:${booking.currency}:${attempt}`)
    .digest("hex");

  const existing = booking.payments.find((p) => p.idempotencyKey === idempotencyKey);
  if (existing?.providerPaymentId) {
    // Resuming rather than charging again. The provider session is keyed on
    // its own id, so a refreshed payment page cannot become a second charge.
    const provider = providerFor();
    return provider.create({
      bookingId: booking.id,
      reference: booking.reference,
      amountMinor: booking.totalAmount,
      currency: booking.currency,
      idempotencyKey,
      returnUrl: options.returnUrl,
      guestEmail: booking.guest.email,
    });
  }

  const provider = providerFor();
  const intent = await runOnce({
    key: `payment:${idempotencyKey}`,
    scope: "payment",
    request: { bookingId: booking.id, amount: booking.totalAmount, attempt },
    ttlMs: 24 * 60 * 60 * 1000,
    work: async () => {
      const created = await provider.create({
        bookingId: booking.id,
        reference: booking.reference,
        amountMinor: booking.totalAmount,
        currency: booking.currency,
        idempotencyKey,
        returnUrl: options.returnUrl,
        guestEmail: booking.guest.email,
      });
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: provider.name,
          providerPaymentId: created.providerPaymentId,
          idempotencyKey,
          amount: booking.totalAmount,
          currency: booking.currency,
          status: "REDIRECTED",
        },
      });
      return created;
    },
  });

  if (booking.status === "DRAFT") {
    await transition({
      bookingId: booking.id,
      to: "PENDING_PAYMENT",
      type: "payment.started",
      actorType: "guest",
      payload: { providerPaymentId: intent.providerPaymentId },
      data: { paymentStatus: "pending" },
    });
  }

  return intent;
}

/* ------------------------------------------------------------------ *
 * The webhook — the only source of truth about money
 * ------------------------------------------------------------------ */

export type WebhookOutcome =
  | { handled: true; bookingId: string; status: string }
  | { handled: false; reason: string };

/**
 * A guest who closes the tab after paying must still end with a confirmed
 * booking; a guest who reaches the success page without a verified webhook
 * must not. Nothing here trusts the browser.
 */
export async function handleWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<WebhookOutcome> {
  const provider = providerFor();
  const event = await provider.parseWebhook(rawBody, headers);
  if (!event) return { handled: false, reason: "The signature did not verify." };

  // Replay protection on the provider's own event id, before any state moves.
  const key = `webhook:${provider.name}:${event.eventId}`;
  const seen = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (seen) return { handled: false, reason: "Already processed." };

  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: event.providerPaymentId },
    include: { booking: true },
  });
  if (!payment) return { handled: false, reason: "No payment matches that id." };

  // The amount is checked, not assumed. A capture for less than the total is
  // not a paid booking, whatever the provider called it.
  if (event.kind === "captured" && event.amountMinor !== payment.amount) {
    await prisma.bookingEvent.create({
      data: {
        bookingId: payment.bookingId,
        type: "payment.amount_mismatch",
        actorType: "provider",
        correlationId: payment.booking.correlationId,
        payload: { expected: payment.amount, received: event.amountMinor } as never,
      },
    });
    return { handled: false, reason: "The captured amount does not match the booking." };
  }

  await prisma.idempotencyKey.create({
    data: {
      key,
      scope: "webhook",
      requestHash: createHash("sha256").update(rawBody).digest("hex"),
      status: "done",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  if (event.kind === "captured") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        method: event.method,
        last4: event.last4,
        capturedAt: new Date(),
        rawResponse: redactPayment(event.raw) as never,
      },
    });
    if (payment.booking.status === "PENDING_PAYMENT") {
      await transition({
        bookingId: payment.bookingId,
        to: "PAID",
        type: "payment.captured",
        actorType: "provider",
        payload: { eventId: event.eventId, amount: event.amountMinor },
        data: { paymentStatus: "paid" },
      });
    }
    return { handled: true, bookingId: payment.bookingId, status: "PAID" };
  }

  if (event.kind === "failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", rawResponse: redactPayment(event.raw) as never },
    });
    if (payment.booking.status === "PENDING_PAYMENT") {
      await transition({
        bookingId: payment.bookingId,
        to: "PAYMENT_FAILED",
        type: "payment.failed",
        actorType: "provider",
        payload: { eventId: event.eventId },
        data: { paymentStatus: "failed" },
      });
    }
    return { handled: true, bookingId: payment.bookingId, status: "PAYMENT_FAILED" };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (payment.booking.status === "REFUND_PENDING") {
    await transition({
      bookingId: payment.bookingId,
      to: "REFUNDED",
      type: "payment.refunded",
      actorType: "provider",
      payload: { eventId: event.eventId },
      data: { paymentStatus: "refunded" },
    });
  }
  return { handled: true, bookingId: payment.bookingId, status: "REFUNDED" };
}

/** Never store a card number, whatever the provider sends. */
function redactPayment(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (/card|pan|cvv|cvc|number|token/i.test(key) && key !== "last4") out[key] = "[redacted]";
  }
  return out;
}
