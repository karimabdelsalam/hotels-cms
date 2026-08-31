"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

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
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession({ userId: user.id, email: user.email });
  redirect("/");
}
