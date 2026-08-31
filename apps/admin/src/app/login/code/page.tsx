import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBrand } from "@fantazia/db/content";
import { prisma } from "@fantazia/db";
import { getActor } from "@/server/auth";
import { readPending } from "@/lib/pending";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "Two-step check — Fantazia Admin" };

export default async function CodePage() {
  if (await getActor()) redirect("/");

  // No half-authenticated state means nobody got here by entering a password.
  const pending = await readPending();
  if (!pending) redirect("/login");

  const [brand, remaining] = await Promise.all([
    getBrand("en"),
    prisma.userRecoveryCode.count({ where: { userId: pending.userId, usedAt: null } }),
  ]);

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <b>{brand.wordmark}</b>
          <span>Admin</span>
        </div>
        <CodeForm recoveryCodesLeft={remaining} />
      </div>
    </main>
  );
}
