"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction, assertResortInScopeForAction } from "@/server/auth";
import { revalidatePublicSite } from "@/server/revalidate";
import { audit } from "@/server/audit";

/* ------------------------------------------------------------------ *
 * Rate plans and cancellation policies
 *
 * A rate plan is what a guest is actually buying: a price, a meal
 * arrangement, and the terms for changing their mind. All three were
 * seed-only, which meant adding an all-inclusive rate or softening a
 * cancellation policy needed someone with a database client.
 * ------------------------------------------------------------------ */

const MEAL_PLANS = ["room_only", "bed_and_breakfast", "half_board", "full_board", "all_inclusive"] as const;

async function guardPlan(ratePlanId: string) {
  const actor = await requirePermissionForAction("content:write");
  const plan = await prisma.ratePlan.findUnique({
    where: { id: ratePlanId },
    select: { resortId: true },
  });
  if (!plan) return { ok: false as const, error: "That rate plan no longer exists." };
  assertResortInScopeForAction(actor, plan.resortId);
  return { ok: true as const, actor, resortId: plan.resortId };
}

const Plan = z.object({
  ratePlanId: z.string().min(1),
  externalCode: z.string().max(20).nullable(),
  mealPlan: z.enum(MEAL_PLANS),
  policyId: z.string().nullable(),
  minStay: z.coerce.number().int().min(1).max(365).nullable(),
  maxStay: z.coerce.number().int().min(1).max(365).nullable(),
  advanceDays: z.coerce.number().int().min(0).max(730).nullable(),
  isPublic: z.boolean(),
  active: z.boolean(),
});

export async function saveRatePlan(_prev: unknown, formData: FormData) {
  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    return raw === "" ? null : raw;
  };

  const parsed = Plan.safeParse({
    ratePlanId: String(formData.get("ratePlanId") ?? ""),
    externalCode: (formData.get("externalCode") as string)?.trim().toUpperCase() || null,
    mealPlan: String(formData.get("mealPlan") ?? "bed_and_breakfast"),
    policyId: (formData.get("policyId") as string) || null,
    minStay: num("minStay"),
    maxStay: num("maxStay"),
    advanceDays: num("advanceDays"),
    isPublic: formData.get("isPublic") === "on",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  // A plan whose minimum exceeds its maximum can never be booked, and nothing
  // downstream would ever say why: it would simply never appear in results.
  if (d.minStay != null && d.maxStay != null && d.minStay > d.maxStay) {
    return { error: `A minimum of ${d.minStay} nights cannot sit above a maximum of ${d.maxStay}.` };
  }

  const g = await guardPlan(d.ratePlanId);
  if (!g.ok) return { error: g.error };

  if (d.externalCode) {
    const clash = await prisma.ratePlan.findFirst({
      where: { resortId: g.resortId, externalCode: d.externalCode, NOT: { id: d.ratePlanId } },
      include: { translations: { where: { localeCode: "en" }, select: { name: true } } },
    });
    if (clash) {
      // Two plans sharing an OPERA rate code makes pricing ambiguous the
      // moment the connector is switched on.
      return {
        error: `Rate code ${d.externalCode} is already used by ${clash.translations[0]?.name ?? "another plan"} at this resort.`,
      };
    }
  }

  if (d.policyId) {
    const policy = await prisma.cancellationPolicy.findUnique({ where: { id: d.policyId } });
    // A policy from another resort would show a guest terms the property does
    // not honour.
    if (!policy || policy.resortId !== g.resortId) {
      return { error: "That cancellation policy belongs to a different resort." };
    }
  }

  const before = await prisma.ratePlan.findUnique({ where: { id: d.ratePlanId } });
  const after = await prisma.ratePlan.update({
    where: { id: d.ratePlanId },
    data: {
      externalCode: d.externalCode,
      mealPlan: d.mealPlan,
      policyId: d.policyId,
      minStay: d.minStay,
      maxStay: d.maxStay,
      advanceDays: d.advanceDays,
      isPublic: d.isPublic,
      active: d.active,
    },
  });

  await audit(g.actor, "rateplan.update", "RatePlan", after.id, before, after);
  revalidatePath("/rates");
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

const PlanText = z.object({
  ratePlanId: z.string().min(1),
  localeCode: z.string().min(2),
  name: z.string().min(1, "A name is required").max(120),
  description: z.string().max(2000).nullable(),
});

export async function saveRatePlanText(_prev: unknown, formData: FormData) {
  const parsed = PlanText.safeParse({
    ratePlanId: String(formData.get("ratePlanId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    description: (formData.get("description") as string)?.trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const g = await guardPlan(d.ratePlanId);
  if (!g.ok) return { error: g.error };

  const payload = { name: d.name, description: d.description };
  const after = await prisma.ratePlanTranslation.upsert({
    where: { ratePlanId_localeCode: { ratePlanId: d.ratePlanId, localeCode: d.localeCode } },
    update: payload,
    create: { ratePlanId: d.ratePlanId, localeCode: d.localeCode, ...payload },
  });

  await audit(g.actor, "rateplan.text.save", "RatePlanTranslation", after.id, null, after);
  revalidatePath("/rates");
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

export async function createRatePlan(resortId: string) {
  const actor = await requirePermissionForAction("content:write");
  assertResortInScopeForAction(actor, resortId);

  const count = await prisma.ratePlan.count({ where: { resortId } });
  const plan = await prisma.ratePlan.create({
    data: {
      resortId,
      mealPlan: "bed_and_breakfast",
      isPublic: true,
      // Off until someone has named it and given it terms. A nameless plan
      // appearing in search results is worse than one missing.
      active: false,
      displayOrder: count,
      translations: { create: [{ localeCode: "en", name: "New rate plan" }] },
    },
  });

  await audit(actor, "rateplan.create", "RatePlan", plan.id, null, plan);
  revalidatePath("/rates");
  return plan.id;
}

export async function deleteRatePlan(ratePlanId: string) {
  const g = await guardPlan(ratePlanId);
  if (!g.ok) return { error: g.error };

  // Deleting a plan a booking was made on would take the booking's own record
  // of what was sold with it. Switching it off is the answer.
  const used = await prisma.bookingRoom.count({ where: { ratePlanId } });
  if (used > 0) {
    return {
      error: `${used} booking${used === 1 ? " has" : "s have"} been made on this plan, so it cannot be deleted. Switch it off instead — existing bookings keep their terms and it stops appearing in search.`,
    };
  }

  const before = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
  await prisma.ratePlan.delete({ where: { id: ratePlanId } });

  await audit(g.actor, "rateplan.delete", "RatePlan", ratePlanId, before, null);
  revalidatePath("/rates");
  await revalidatePublicSite();
  return { ok: true as const };
}

/* ---------------- cancellation policies ---------------- */

const Policy = z.object({
  policyId: z.string().optional(),
  resortId: z.string().min(1),
  type: z.enum(["free_until", "non_refundable", "partial", "custom"]),
  freeUntilDays: z.coerce.number().int().min(0).max(365).nullable(),
  freeUntilTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 18:00").nullable(),
  penaltyType: z.enum(["percentage", "nights", "fixed"]).nullable(),
  penaltyValue: z.coerce.number().int().min(0).max(100000).nullable(),
  summaryEn: z.string().min(1, "Write what the guest will read").max(500),
  summaryAr: z.string().max(500).nullable(),
});

export async function savePolicy(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");
  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    return raw === "" ? null : raw;
  };

  const parsed = Policy.safeParse({
    policyId: (formData.get("policyId") as string) || undefined,
    resortId: String(formData.get("resortId") ?? ""),
    type: String(formData.get("type") ?? "free_until"),
    freeUntilDays: num("freeUntilDays"),
    freeUntilTime: (formData.get("freeUntilTime") as string)?.trim() || null,
    penaltyType: (formData.get("penaltyType") as string) || null,
    penaltyValue: num("penaltyValue"),
    summaryEn: String(formData.get("summaryEn") ?? "").trim(),
    summaryAr: (formData.get("summaryAr") as string)?.trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;
  assertResortInScopeForAction(actor, d.resortId);

  if (d.type === "free_until" && d.freeUntilDays == null) {
    return { error: "Say how many days before arrival cancellation stays free." };
  }
  if (d.type === "partial" && (d.penaltyType == null || d.penaltyValue == null)) {
    return { error: "A partial-refund policy needs the penalty and its size." };
  }

  const before = d.policyId
    ? await prisma.cancellationPolicy.findUnique({ where: { id: d.policyId } })
    : null;

  const payload = {
    resortId: d.resortId,
    type: d.type,
    freeUntilDays: d.freeUntilDays,
    freeUntilTime: d.freeUntilTime,
    penaltyType: d.penaltyType,
    penaltyValue: d.penaltyValue,
  };

  const policy = d.policyId
    ? await prisma.cancellationPolicy.update({ where: { id: d.policyId }, data: payload })
    : await prisma.cancellationPolicy.create({ data: payload });

  // The summary is what the guest is held to at checkout, so it is written by
  // a person rather than generated from the fields above. Generated policy
  // text is how a hotel ends up unable to defend a charge.
  for (const [localeCode, summary] of [["en", d.summaryEn], ["ar", d.summaryAr]] as const) {
    if (!summary) continue;
    await prisma.cancellationPolicyTranslation.upsert({
      where: { policyId_localeCode: { policyId: policy.id, localeCode } },
      update: { summary },
      create: { policyId: policy.id, localeCode, summary },
    });
  }

  await audit(actor, d.policyId ? "policy.update" : "policy.create",
              "CancellationPolicy", policy.id, before, policy);
  revalidatePath("/rates");
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

export async function deletePolicy(policyId: string) {
  const actor = await requirePermissionForAction("content:write");
  const policy = await prisma.cancellationPolicy.findUnique({
    where: { id: policyId },
    include: { ratePlans: { select: { id: true } } },
  });
  if (!policy) return { error: "That policy no longer exists." };
  assertResortInScopeForAction(actor, policy.resortId);

  if (policy.ratePlans.length > 0) {
    return {
      error: `${policy.ratePlans.length} rate plan${policy.ratePlans.length === 1 ? " uses" : "s use"} this policy. Point them somewhere else first.`,
    };
  }

  await prisma.cancellationPolicy.delete({ where: { id: policyId } });
  await audit(actor, "policy.delete", "CancellationPolicy", policyId, policy, null);
  revalidatePath("/rates");
  return { ok: true as const };
}
