"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import { audit } from "@/server/audit";

const Input = z.object({ key: z.string().min(1), enabled: z.boolean() });

export async function setModuleEnabled(key: string, enabled: boolean) {
  const actor = await requirePermissionForAction("modules:write");
  const parsed = Input.parse({ key, enabled });

  const before = await prisma.siteModule.findUnique({ where: { key: parsed.key } });
  if (!before) throw new Error("No such section");

  const after = await prisma.siteModule.update({
    where: { key: parsed.key },
    data: { enabled: parsed.enabled },
  });

  await audit(actor, "module.toggle", "SiteModule", parsed.key, before, after);
  revalidatePath("/modules");
  revalidatePath("/");
}
