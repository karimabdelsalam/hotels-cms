"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createHold,
  validateHold,
  createBookingFromHold,
  startPayment,
  ConnectorRejection,
  ConnectorUnavailable,
} from "@fantazia/booking";

/**
 * A browser session id, so a hold belongs to whoever created it.
 *
 * Not a login: it only stops one visitor resuming another's checkout on a
 * shared machine. httpOnly, so page scripts cannot read or forge it.
 */
const SESSION_COOKIE = "fantazia_checkout";

async function sessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const fresh = randomUUID();
  jar.set(SESSION_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  return fresh;
}

const Selection = z.object({
  locale: z.string().min(2).max(12),
  resortId: z.string().min(1),
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20),
  rooms: z.coerce.number().int().min(1).max(9),
});

/** Chooses a room, takes a hold, and moves the guest into checkout. */
export async function selectRoom(formData: FormData) {
  const parsed = Selection.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/");
  const d = parsed.data;

  const session = await sessionId();
  let holdId: string;
  try {
    const hold = await createHold({
      resortId: d.resortId,
      sessionId: session,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      lines: [
        {
          roomTypeId: d.roomTypeId,
          ratePlanId: d.ratePlanId,
          quantity: d.rooms,
          occupancy: { adults: d.adults, children: d.children, childAges: [] },
        },
      ],
    });
    holdId = hold.holdId;
  } catch (error) {
    // Someone took the last room between the results page and this click.
    if (error instanceof ConnectorRejection || error instanceof ConnectorUnavailable) {
      const back = new URLSearchParams({
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        adults: String(d.adults),
        children: String(d.children),
        rooms: String(d.rooms),
        gone: "1",
      });
      redirect(`/${d.locale}/book?${back.toString()}`);
    }
    throw error;
  }

  redirect(`/${d.locale}/book/checkout?hold=${holdId}`);
}

const Guest = z.object({
  holdId: z.string().min(1),
  locale: z.string().min(2).max(12),
  firstName: z.string().min(1, "Please give your first name").max(80),
  lastName: z.string().min(1, "Please give your last name").max(80),
  email: z.string().email("That email does not look right"),
  phone: z.string().max(40).optional(),
  country: z.string().max(2).optional(),
  specialRequests: z.string().max(1000).optional(),
  marketingConsent: z.boolean(),
});

export type CheckoutState =
  | { error: string }
  | { priceChanged: true; wasMinor: number; nowMinor: number; currency: string }
  | null;

/**
 * Takes the guest's details, re-checks the price, and hands off to payment.
 *
 * The re-check is the point. A price that moved is shown as a difference the
 * guest accepts; it is never charged silently, and the old number is never
 * quietly honoured either.
 */
export async function submitGuest(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const parsed = Guest.safeParse({
    holdId: String(formData.get("holdId") ?? ""),
    locale: String(formData.get("locale") ?? "en"),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    country: (formData.get("country") as string)?.trim() || undefined,
    specialRequests: (formData.get("specialRequests") as string)?.trim() || undefined,
    marketingConsent: formData.get("marketingConsent") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const d = parsed.data;

  const validated = await validateHold(d.holdId);
  if (!validated.ok) {
    if (validated.reason === "changed") {
      return {
        priceChanged: true,
        wasMinor: validated.previousTotalMinor,
        nowMinor: validated.quote.totalMinor,
        currency: validated.quote.currency,
      };
    }
    if (validated.reason === "unavailable") return { error: validated.message };
    return { error: "expired" };
  }

  let bookingId: string;
  try {
    const created = await createBookingFromHold({
      holdId: d.holdId,
      guest: {
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
        country: d.country,
        marketingConsent: d.marketingConsent,
      },
      locale: d.locale,
      specialRequests: d.specialRequests,
    });
    bookingId = created.bookingId;
  } catch (error) {
    if (error instanceof ConnectorRejection) return { error: error.message };
    throw error;
  }

  // Behind Apache the app itself is plain HTTP; the scheme the guest is using
  // is what the proxy forwards. Deciding it from NODE_ENV instead sends people
  // to an https URL on a port that has no TLS.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  let redirectUrl: string;
  try {
    const intent = await startPayment({
      bookingId,
      returnUrl: `${scheme}://${host}/${d.locale}/book/confirmation/pending`,
    });
    redirectUrl = intent.redirectUrl;
  } catch (error) {
    // A misconfigured payment provider is our problem, not the guest's. They
    // get a sentence they can act on; the detail goes to the server log for
    // whoever configured it. A stack trace at the moment of payment is the
    // worst possible place to leak one.
    console.error("[payment] could not start a payment:", error);
    return {
      error:
        "We could not open the payment page. Nothing has been charged. Please try again in a moment, or contact us and quote your dates.",
    };
  }

  redirect(redirectUrl);
}
