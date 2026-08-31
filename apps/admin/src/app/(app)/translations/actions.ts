"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import {
  translateBatch,
  isConfigured,
  TranslationUnavailable,
  TRANSLATION_MODEL,
} from "@/server/translate";
import { revalidatePublicSite } from "@/server/revalidate";
import { audit } from "@/server/audit";

const One = z.object({
  id: z.string().min(1),
  value: z.string().max(4000),
});

export async function saveString(id: string, value: string) {
  const actor = await requirePermissionForAction("translations:write");
  const d = One.parse({ id, value });

  const before = await prisma.translationString.findUnique({ where: { id: d.id } });
  if (!before) throw new Error("That string no longer exists.");
  if (before.localeCode === "en") {
    // English is the source and lives in code. Editing it here would be
    // overwritten by the next sync, silently.
    throw new Error("English is the source language and is edited in code, not here.");
  }

  const after = await prisma.translationString.update({
    where: { id: d.id },
    data: {
      value: d.value,
      status: d.value.trim() ? "translated" : "missing",
      // The moment a person touches a string it becomes theirs. Automatic
      // translation skips it from here on, whatever its status becomes later.
      humanEdited: true,
      editedById: actor.id,
    },
  });

  await audit(actor, "translation.save", "TranslationString", after.id, before, after);
  revalidatePath("/translations");
  return { status: after.status };
}

/** Machine output is marked, never treated as finished. */
export async function markReviewed(id: string) {
  const actor = await requirePermissionForAction("translations:write");
  const before = await prisma.translationString.findUnique({ where: { id } });
  if (!before) throw new Error("That string no longer exists.");

  const after = await prisma.translationString.update({
    where: { id },
    data: { status: before.value.trim() ? "translated" : "missing" },
  });
  await audit(actor, "translation.review", "TranslationString", id, before, after);
  revalidatePath("/translations");
}

export async function publishTranslations() {
  const actor = await requirePermissionForAction("content:publish");
  const result = await revalidatePublicSite();
  await audit(actor, "translation.publish", "TranslationString", null, null, { result });
  return result;
}

/** JSON, CSV or XLIFF for an agency to work in offline. */
export async function exportTranslations(localeCode: string, format: "json" | "csv" | "xliff") {
  await requirePermissionForAction("translations:write");

  const rows = await prisma.translationString.findMany({
    where: { localeCode, status: { not: "removed" } },
    orderBy: [{ namespace: "asc" }, { key: "asc" }],
  });
  const english = await prisma.translationString.findMany({
    where: { localeCode: "en", status: { not: "removed" } },
    select: { namespace: true, key: true, value: true },
  });
  const sourceFor = (namespace: string, key: string) =>
    english.find((e) => e.namespace === namespace && e.key === key)?.value ?? "";

  if (format === "json") {
    const flat: Record<string, string> = {};
    for (const r of rows) flat[`${r.namespace}.${r.key}`] = r.value;
    return { filename: `${localeCode}.json`, body: JSON.stringify(flat, null, 2) };
  }

  if (format === "csv") {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["key,source_english,translation,status"];
    for (const r of rows) {
      lines.push(
        [
          escape(`${r.namespace}.${r.key}`),
          escape(sourceFor(r.namespace, r.key)),
          escape(r.value),
          escape(r.status),
        ].join(","),
      );
    }
    return { filename: `${localeCode}.csv`, body: lines.join("\n") };
  }

  const xml = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const units = rows
    .map(
      (r) => `    <trans-unit id="${xml(`${r.namespace}.${r.key}`)}">
      <source>${xml(sourceFor(r.namespace, r.key))}</source>
      <target state="${r.status === "translated" ? "translated" : "needs-translation"}">${xml(r.value)}</target>
    </trans-unit>`,
    )
    .join("\n");

  return {
    filename: `${localeCode}.xlf`,
    body: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="fantazia" source-language="en" target-language="${xml(localeCode)}" datatype="plaintext">
    <body>
${units}
    </body>
  </file>
</xliff>`,
  };
}

/**
 * Import is a dry run first: the diff is shown before anything is written, so a
 * bad file from an agency cannot quietly overwrite a locale.
 */
export type ImportPreview =
  | { ok: false; error: string }
  | {
      ok: true;
      changes: { id: string; path: string; from: string; to: string }[];
      unknown: number;
      identical: number;
      total: number;
    };

export async function previewImport(localeCode: string, raw: string): Promise<ImportPreview> {
  await requirePermissionForAction("translations:write");

  let incoming: Record<string, string>;
  try {
    incoming = parseImport(raw);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That file could not be read.",
    };
  }

  const rows = await prisma.translationString.findMany({
    where: { localeCode, status: { not: "removed" } },
  });

  const changes: { id: string; path: string; from: string; to: string }[] = [];
  let unknown = 0;
  let identical = 0;

  for (const [path, value] of Object.entries(incoming)) {
    const dot = path.indexOf(".");
    const namespace = dot === -1 ? "common" : path.slice(0, dot);
    const key = dot === -1 ? path : path.slice(dot + 1);
    const row = rows.find((r) => r.namespace === namespace && r.key === key);
    if (!row) {
      unknown += 1;
      continue;
    }
    if (row.value === value) {
      identical += 1;
      continue;
    }
    changes.push({ id: row.id, path, from: row.value, to: value });
  }

  return { ok: true, changes, unknown, identical, total: Object.keys(incoming).length };
}

export async function commitImport(
  localeCode: string,
  changes: { id: string; to: string }[],
) {
  const actor = await requirePermissionForAction("translations:write");

  for (const change of changes) {
    await prisma.translationString.update({
      where: { id: change.id },
      data: { value: change.to, status: change.to.trim() ? "translated" : "missing" },
    });
  }

  await audit(actor, "translation.import", "TranslationString", localeCode, null, {
    locale: localeCode,
    applied: changes.length,
  });
  revalidatePath("/translations");
  return { applied: changes.length };
}

function parseImport(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) throw new Error("The file is empty.");

  if (text.startsWith("{")) {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("That JSON is not an object.");
    const flat: Record<string, string> = {};
    const walk = (node: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") flat[path] = v;
        else if (v && typeof v === "object") walk(v as Record<string, unknown>, path);
      }
    };
    walk(parsed as Record<string, unknown>, "");
    return flat;
  }

  if (text.startsWith("<?xml") || text.includes("<xliff")) {
    const flat: Record<string, string> = {};
    const unit = /<trans-unit[^>]*id="([^"]+)"[\s\S]*?<target[^>]*>([\s\S]*?)<\/target>/g;
    let match: RegExpExecArray | null;
    while ((match = unit.exec(text)) !== null) {
      flat[decodeXml(match[1]!)] = decodeXml(match[2]!);
    }
    if (Object.keys(flat).length === 0) throw new Error("No translation units found in that XLIFF.");
    return flat;
  }

  // CSV: key,source,translation[,status]
  const flat: Record<string, string> = {};
  const rows = parseCsv(text);
  for (const row of rows.slice(1)) {
    const key = row[0]?.trim();
    if (!key) continue;
    flat[key] = row[2] ?? "";
  }
  if (Object.keys(flat).length === 0) throw new Error("No rows found in that CSV.");
  return flat;
}

function decodeXml(v: string): string {
  return v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Minimal RFC 4180 reader — quoted fields, doubled quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}


/* ------------------------------------------------------------------ *
 * Automatic translation
 * ------------------------------------------------------------------ */

export type AutoTranslateResult = {
  ok: boolean;
  translated: number;
  skippedHumanEdited: number;
  rejected: { path: string; reason: string }[];
  message: string;
};

const BATCH_SIZE = 40;

/**
 * Fill a language from English.
 *
 * What it will touch: strings that are missing, unreviewed machine output, and
 * strings the English has since changed under (`needs_review`, set by
 * `syncTranslationKeys` when the source hash drifts) — that last case is what
 * makes editing the English actually re-translate the rest.
 *
 * What it will never touch: anything a person has edited. That is a column on
 * the row, not an inference from status, so it holds however the status changes
 * later — including when the English drifts under a hand-written translation.
 * Such a string is flagged for review in the table and left for a person; it is
 * never quietly rewritten.
 */
export async function autoTranslateLocale(
  localeCode: string,
  scope: "missing" | "missing_and_stale",
): Promise<AutoTranslateResult> {
  const actor = await requirePermissionForAction("translations:write");

  if (!isConfigured()) {
    return {
      ok: false,
      translated: 0,
      skippedHumanEdited: 0,
      rejected: [],
      message: "Automatic translation is not configured. Set ANTHROPIC_API_KEY to enable it.",
    };
  }

  const locale = await prisma.locale.findUnique({ where: { code: localeCode } });
  if (!locale) {
    return { ok: false, translated: 0, skippedHumanEdited: 0, rejected: [], message: "No such language." };
  }
  if (locale.isDefault) {
    return {
      ok: false,
      translated: 0,
      skippedHumanEdited: 0,
      rejected: [],
      message: "English is the source language — there is nothing to translate into it.",
    };
  }

  const statuses = scope === "missing" ? ["missing"] : ["missing", "machine", "needs_review"];

  // How many were left alone because someone had edited them. Reported rather
  // than hidden, so the count always adds up for whoever pressed the button.
  const skippedHumanEdited = await prisma.translationString.count({
    where: { localeCode, status: { in: statuses }, humanEdited: true },
  });

  const candidates = await prisma.translationString.findMany({
    where: { localeCode, status: { in: statuses }, humanEdited: false },
    orderBy: [{ namespace: "asc" }, { key: "asc" }],
  });

  if (candidates.length === 0) {
    return {
      ok: true,
      translated: 0,
      skippedHumanEdited,
      rejected: [],
      message:
        skippedHumanEdited > 0
          ? `Nothing to translate. ${skippedHumanEdited} string${skippedHumanEdited === 1 ? " was" : "s were"} left alone because ${skippedHumanEdited === 1 ? "it has" : "they have"} been edited by hand.`
          : "Nothing to translate — this language is already filled in.",
    };
  }

  const english = await prisma.translationString.findMany({
    where: { localeCode: "en", status: { not: "removed" } },
    select: { namespace: true, key: true, value: true },
  });
  const sourceFor = (namespace: string, key: string) =>
    english.find((e) => e.namespace === namespace && e.key === key)?.value ?? "";

  let translated = 0;
  const rejected: { path: string; reason: string }[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const slice = candidates.slice(i, i + BATCH_SIZE);
    const items = slice
      .map((row) => ({
        row,
        path: `${row.namespace}.${row.key}`,
        source: sourceFor(row.namespace, row.key),
      }))
      .filter((item) => item.source.trim());

    if (items.length === 0) continue;

    let results;
    try {
      results = await translateBatch(
        localeCode,
        locale.nativeName,
        items.map(({ path, source }) => ({ path, source })),
      );
    } catch (error) {
      const message =
        error instanceof TranslationUnavailable
          ? error.message
          : "The translation service could not be reached. Nothing was changed by this batch.";
      return {
        ok: false,
        translated,
        skippedHumanEdited,
        rejected,
        message: `${message}${translated > 0 ? ` ${translated} string${translated === 1 ? "" : "s"} saved before the failure.` : ""}`,
      };
    }

    for (const result of results) {
      const item = items.find((x) => x.path === result.path);
      if (!item) continue;

      if (!result.ok) {
        rejected.push({ path: result.path, reason: result.reason });
        continue;
      }

      // Re-check immediately before writing: a person may have edited this
      // string while the batch was in flight, and they win.
      const current = await prisma.translationString.findUnique({ where: { id: item.row.id } });
      if (!current || current.humanEdited) continue;

      await prisma.translationString.update({
        where: { id: item.row.id },
        data: {
          value: result.value,
          status: "machine",
          machineModel: TRANSLATION_MODEL,
          machineAt: new Date(),
        },
      });
      translated += 1;
    }
  }

  await audit(actor, "translation.auto", "TranslationString", localeCode, null, {
    locale: localeCode,
    translated,
    skippedHumanEdited,
    rejected: rejected.length,
    model: TRANSLATION_MODEL,
  });
  revalidatePath("/translations");

  const parts = [`${translated} string${translated === 1 ? "" : "s"} translated and marked for review`];
  if (skippedHumanEdited > 0) {
    parts.push(`${skippedHumanEdited} left alone because ${skippedHumanEdited === 1 ? "it has" : "they have"} been edited by hand`);
  }
  if (rejected.length > 0) {
    parts.push(`${rejected.length} rejected`);
  }

  return { ok: true, translated, skippedHumanEdited, rejected, message: `${parts.join(", ")}.` };
}

/** A suggestion for one string. Never written — the editor accepts or ignores it. */
export async function suggestTranslation(id: string) {
  await requirePermissionForAction("translations:write");

  if (!isConfigured()) {
    return { ok: false as const, error: "Automatic translation is not configured." };
  }

  const row = await prisma.translationString.findUnique({ where: { id } });
  if (!row) return { ok: false as const, error: "That string no longer exists." };

  const [locale, source] = await Promise.all([
    prisma.locale.findUnique({ where: { code: row.localeCode } }),
    prisma.translationString.findUnique({
      where: {
        namespace_key_localeCode: {
          namespace: row.namespace,
          key: row.key,
          localeCode: "en",
        },
      },
    }),
  ]);
  if (!locale || !source?.value.trim()) {
    return { ok: false as const, error: "There is no English source for that string." };
  }

  try {
    const [result] = await translateBatch(locale.code, locale.nativeName, [
      { path: `${row.namespace}.${row.key}`, source: source.value },
    ]);
    if (!result || !result.ok) {
      return { ok: false as const, error: result?.reason ?? "No suggestion was returned." };
    }
    return { ok: true as const, value: result.value };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof TranslationUnavailable
          ? error.message
          : "The translation service could not be reached.",
    };
  }
}
