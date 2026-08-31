import { NextResponse } from "next/server";
import { handleWebhook, confirmBooking } from "@fantazia/booking";

/**
 * The only thing allowed to say a booking is paid.
 *
 * A guest who closes the tab after paying must still end confirmed; a guest
 * who reaches the success page without a verified webhook must not. The
 * browser redirect decides what page to render and nothing else.
 */
export async function POST(request: Request) {
  // Read raw, not parsed: the signature covers the bytes, and JSON.parse then
  // re-stringify would change them.
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const outcome = await handleWebhook(rawBody, headers);

  if (!outcome.handled) {
    // A rejected signature gets a 401 so the provider retries nothing; an
    // already-processed event gets a 200 so it stops retrying.
    const forged = /signature/i.test(outcome.reason);
    return NextResponse.json({ ok: false, reason: outcome.reason }, { status: forged ? 401 : 200 });
  }

  if (outcome.status === "PAID") {
    // Kicked off here rather than awaited by the guest's browser. If it fails,
    // the retry schedule and the review queue pick it up — the webhook must
    // still return quickly or the provider will redeliver it.
    void confirmBooking(outcome.bookingId).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
