import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@fantazia/db";

/**
 * Stands in for a payment provider's hosted page.
 *
 * There is no real provider configured yet, so this exists to exercise the
 * whole path end to end: it posts a signed webhook to our own endpoint exactly
 * as a provider would, then sends the guest to the confirmation page. It
 * refuses to run in production unless explicitly allowed, because a payment
 * page that always succeeds is not a payment page.
 */
function guard(): string | null {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_PAYMENTS !== "yes") {
    return "Test payments are switched off.";
  }
  return null;
}

export async function GET(request: Request) {
  const blocked = guard();
  if (blocked) return new NextResponse(blocked, { status: 404 });

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment");
  const bookingId = url.searchParams.get("booking");
  if (!paymentId || !bookingId) return new NextResponse("Missing parameters", { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { reference: true, totalAmount: true, currency: true, locale: true },
  });
  if (!booking) return new NextResponse("No such booking", { status: 404 });

  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: booking.currency,
  }).format(booking.totalAmount / 100);

  // Deliberately ugly. Nobody should mistake this for the real thing.
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test payment</title>
<style>
 body{font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#1b1b1b;color:#eee}
 .card{background:#262626;border:2px dashed #f0a;border-radius:14px;padding:28px;max-width:420px}
 h1{font-size:1.1rem;margin:0 0 4px}
 p{color:#aaa;font-size:.875rem;line-height:1.5}
 form{display:flex;gap:8px;margin-top:18px}
 button{flex:1;padding:12px;border-radius:8px;border:0;font:inherit;font-weight:600;cursor:pointer}
 .ok{background:#1db954;color:#000}.no{background:#444;color:#eee}
</style>
<div class="card">
  <h1>Test payment — not a real page</h1>
  <p>Standing in for the payment provider. Booking <b>${booking.reference}</b>, ${amount}.</p>
  <form method="post">
    <input type="hidden" name="payment" value="${paymentId}">
    <input type="hidden" name="booking" value="${bookingId}">
    <input type="hidden" name="locale" value="${booking.locale}">
    <button class="ok" name="outcome" value="captured">Pay</button>
    <button class="no" name="outcome" value="failed">Decline</button>
  </form>
</div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const blocked = guard();
  if (blocked) return new NextResponse(blocked, { status: 404 });

  const form = await request.formData();
  const paymentId = String(form.get("payment") ?? "");
  const locale = String(form.get("locale") ?? "en");
  const outcome = String(form.get("outcome") ?? "failed");

  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: paymentId },
    include: { booking: { select: { reference: true } } },
  });
  if (!payment) return new NextResponse("No such payment", { status: 404 });

  const body = JSON.stringify({
    eventId: `evt_${paymentId}_${outcome}`,
    providerPaymentId: paymentId,
    kind: outcome === "captured" ? "captured" : "failed",
    amountMinor: payment.amount,
    currency: payment.currency,
    method: "card",
    last4: "4242",
  });
  const signature = createHmac("sha256", process.env.PAYMENT_TEST_SECRET ?? "test-secret")
    .update(body)
    .digest("hex");

  // Posted to our own endpoint, over the network, exactly as a provider would.
  // Calling the handler directly would skip the part most worth testing.
  const origin = new URL(request.url).origin;
  await fetch(`${origin}/api/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-signature": signature },
    body,
  });

  const destination =
    outcome === "captured"
      ? `/${locale}/book/confirmation/${payment.booking.reference}`
      : `/${locale}/book/checkout?failed=1`;
  return NextResponse.redirect(new URL(destination, origin), 303);
}
