import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * The five minutes between a correct password and a correct code.
 *
 * This is deliberately not a session: it carries no permissions, cannot be
 * exchanged for one without a valid second factor, and dies quickly. Keeping
 * the half-authenticated state in a signed cookie rather than a database row
 * means an abandoned sign-in leaves nothing behind to clean up.
 */

const COOKIE = "fantazia_admin_pending";
const MAX_AGE = 5 * 60;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

export type PendingPayload = { userId: string };

export async function createPending(payload: PendingPayload): Promise<void> {
  const token = await new SignJWT({ ...payload, stage: "totp" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function readPending(): Promise<PendingPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // A full session token is signed with the same key, so the stage claim is
    // what stops one being presented here in place of a pending one.
    if (payload.stage !== "totp") return null;
    const { userId } = payload as Record<string, unknown>;
    if (typeof userId !== "string") return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function destroyPending(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
