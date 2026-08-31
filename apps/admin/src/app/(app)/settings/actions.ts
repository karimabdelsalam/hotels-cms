"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import { audit } from "@/server/audit";

const Brand = z.object({
  name: z.string().min(1, "The group needs a name").max(120),
  wordmark: z.string().min(1, "The wordmark cannot be empty").max(40),
  locations: z.record(z.string(), z.string()),
  taglines: z.record(z.string(), z.string()),
});

export async function saveBrand(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:publish");

  const locations: Record<string, string> = {};
  const taglines: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("location.")) locations[key.slice(9)] = value.trim();
    if (key.startsWith("tagline.")) taglines[key.slice(8)] = value.trim();
  }

  const parsed = Brand.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    wordmark: String(formData.get("wordmark") ?? "").trim(),
    locations,
    taglines,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const before = await prisma.setting.findMany({ where: { key: { startsWith: "brand." } } });

  const rows: [string, unknown][] = [
    ["brand.name", d.name],
    ["brand.wordmark", d.wordmark],
    ["brand.location", d.locations],
    ["brand.tagline", d.taglines],
  ];
  for (const [key, value] of rows) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }

  await audit(actor, "settings.brand.save", "Setting", "brand", before, rows);
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true as const, savedAt: Date.now() };
}
