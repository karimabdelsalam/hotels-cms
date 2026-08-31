"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { prisma } from "@fantazia/db";
import { requireActor } from "@/server/auth";
import { verifyPassword } from "@/lib/password";
import { generateSecret, verifyCode, enrolmentUri, formatSecret } from "@/lib/totp";
import { issueRecoveryCodes } from "@/server/recovery";
import { audit } from "@/server/audit";

const ISSUER = "Fantazia Hotels";

export type StartResult =
  | { ok: true; secret: string; readable: string; qr: string }
  | { error: string };

/**
 * Step one of enrolment: make a secret and show it.
 *
 * The secret is not stored yet. Writing it before the person has proved their
 * app can produce a code would leave accounts half-enrolled — `totpEnabled`
 * false but a secret sitting in the row — and nothing would ever clean that up.
 */
export async function startEnrolment(): Promise<StartResult> {
  const actor = await requireActor();

  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { totpEnabled: true },
  });
  if (current?.totpEnabled) {
    return { error: "Two-step sign-in is already on for this account." };
  }

  const secret = generateSecret();
  const uri = enrolmentUri(secret, actor.email, ISSUER);
  // An SVG data URI, so the QR needs no extra request and no image route.
  const qr = await QRCode.toString(uri, { type: "svg", margin: 1, width: 220 });

  return { ok: true, secret, readable: formatSecret(secret), qr };
}

export type ConfirmResult =
  | { ok: true; recoveryCodes: string[] }
  | { error: string };

/**
 * Step two: prove the app works, then switch it on.
 *
 * The secret arrives back from the browser rather than from a server-side
 * stash. It is only useful together with a code generated from it, which is
 * exactly what this step checks — so nothing is gained by tampering with it.
 */
export async function confirmEnrolment(secret: string, code: string): Promise<ConfirmResult> {
  const actor = await requireActor();

  if (!/^[A-Z2-7]{32}$/.test(secret)) {
    return { error: "Something went wrong setting this up. Start again." };
  }
  if (!verifyCode(secret, code)) {
    return { error: "That code is not right. Check your app and try the current code." };
  }

  const before = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { totpEnabled: true },
  });
  if (before?.totpEnabled) return { error: "Two-step sign-in is already on for this account." };

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      totpSecret: secret,
      totpEnabled: true,
      totpEnabledAt: new Date(),
      // Nothing has been signed in with yet, so no step is spent.
      totpLastStep: null,
    },
  });

  const recoveryCodes = await issueRecoveryCodes(actor.id);

  // The secret never reaches the audit log — the log is read by other admins.
  await audit(actor, "account.2fa.enable", "User", actor.id, { totpEnabled: false }, { totpEnabled: true });
  revalidatePath("/account");
  return { ok: true, recoveryCodes };
}

/**
 * Turning it off needs the password again.
 *
 * A borrowed unlocked laptop is the threat here: without this, walking past
 * someone's desk is enough to remove their second factor.
 */
export async function disableTwoFactor(password: string): Promise<{ ok: true } | { error: string }> {
  const actor = await requireActor();

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, totpEnabled: true },
  });
  if (!user?.totpEnabled) return { error: "Two-step sign-in is not on for this account." };
  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "That password is not right." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: actor.id },
      data: { totpSecret: null, totpEnabled: false, totpEnabledAt: null, totpLastStep: null },
    }),
    // The codes belong to the secret being removed. Leaving them would let an
    // old printout back in after two-step is turned on again with a new secret.
    prisma.userRecoveryCode.deleteMany({ where: { userId: actor.id } }),
  ]);

  await audit(actor, "account.2fa.disable", "User", actor.id, { totpEnabled: true }, { totpEnabled: false });
  revalidatePath("/account");
  return { ok: true };
}

/** New codes, invalidating the old set. Also needs the password. */
export async function regenerateRecoveryCodes(
  password: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { error: string }> {
  const actor = await requireActor();

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, totpEnabled: true },
  });
  if (!user?.totpEnabled) return { error: "Two-step sign-in is not on for this account." };
  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "That password is not right." };
  }

  const recoveryCodes = await issueRecoveryCodes(actor.id);
  await audit(actor, "account.2fa.recovery_codes", "User", actor.id, null, { reissued: true });
  revalidatePath("/account");
  return { ok: true, recoveryCodes };
}
