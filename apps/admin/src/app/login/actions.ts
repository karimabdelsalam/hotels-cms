"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { createPending, readPending, destroyPending } from "@/lib/pending";
import { verifyCode } from "@/lib/totp";
import { consumeRecoveryCode } from "@/server/recovery";

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function signIn(_prev: { error?: string } | null, formData: FormData) {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // One message for every failure mode, so the form never reveals which
  // addresses exist.
  const GENERIC = { error: "That email and password do not match." };
  if (!parsed.success) return GENERIC;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return GENERIC;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil:
          attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return GENERIC;
  }

  if (user.status !== "active") return GENERIC;

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  // The password was right, but on an account with a second factor that is
  // only half the answer. No session exists until the code checks out.
  if (user.totpEnabled && user.totpSecret) {
    await createPending({ userId: user.id });
    redirect("/login/code");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ userId: user.id, email: user.email });
  redirect("/");
}

const STEP_SECONDS = 30;

/**
 * The second step. Accepts either a code from the authenticator app or one of
 * the recovery codes issued at enrolment.
 */
export async function submitCode(_prev: { error?: string } | null, formData: FormData) {
  const pending = await readPending();
  if (!pending) {
    return { error: "That took too long. Start again from the sign-in page." };
  }

  const submitted = String(formData.get("code") ?? "").trim();
  if (!submitted) return { error: "Enter the six-digit code from your app." };

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.totpEnabled || !user.totpSecret || user.status !== "active") {
    await destroyPending();
    return { error: "Start again from the sign-in page." };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };
  }

  const now = Date.now();
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  let accepted = false;

  if (verifyCode(user.totpSecret, submitted, now)) {
    // A code stays valid for about ninety seconds. Requiring the step to
    // increase means a code someone read over a shoulder is already spent.
    if (user.totpLastStep != null && step <= user.totpLastStep) {
      return { error: "That code has already been used. Wait for the next one." };
    }
    accepted = true;
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
  } else if (await consumeRecoveryCode(user.id, submitted)) {
    accepted = true;
  }

  if (!accepted) {
    // The same counter as the password, so guessing codes locks the account
    // just as guessing passwords does.
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil:
          attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return { error: "That code is not right." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await destroyPending();
  await createSession({ userId: user.id, email: user.email });
  redirect("/");
}
