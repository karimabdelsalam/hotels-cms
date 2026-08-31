import { createHash } from "node:crypto";
import { prisma } from "./index";

export const DEFAULT_LOCALE = "en";

/** Nested catalogue as authored in code: { nav: { book: "Book" } } */
export type MessageTree = { [key: string]: string | MessageTree };

/** Flat form as stored: "nav.book" -> "Book" */
export type FlatMessages = Record<string, string>;

export function flatten(tree: MessageTree, prefix = ""): FlatMessages {
  const out: FlatMessages = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

export function unflatten(flat: FlatMessages): MessageTree {
  const tree: MessageTree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part] as MessageTree;
    }
    node[parts[parts.length - 1]!] = value;
  }
  return tree;
}

export function sourceHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** The first segment of a key is its namespace: "booking.pay" -> "booking". */
function splitKey(path: string): { namespace: string; key: string } {
  const dot = path.indexOf(".");
  return dot === -1
    ? { namespace: "common", key: path }
    : { namespace: path.slice(0, dot), key: path.slice(dot + 1) };
}

export type SyncReport = {
  added: number;
  drifted: number;
  removed: number;
  unchanged: number;
};

/**
 * Reconcile the English catalogue authored in code with the database.
 *
 * Keys come from code; translations come from the database. This is what keeps
 * a seven-language site honest:
 *
 *  - a new key appears for every locale as `missing`;
 *  - an English value that changed flips every other locale to `needs_review`
 *    while KEEPING its old text, so the site keeps working and the manager
 *    shows exactly what drifted. Without this, editing one English sentence
 *    silently leaves six languages saying something else;
 *  - a key removed from code is marked `removed`, never deleted, so a rename
 *    does not destroy paid translation work.
 */
export async function syncTranslationKeys(source: MessageTree): Promise<SyncReport> {
  const flat = flatten(source);
  const locales = await prisma.locale.findMany({ select: { code: true } });
  const existing = await prisma.translationString.findMany();

  const byPath = new Map<string, typeof existing>();
  for (const row of existing) {
    const path = `${row.namespace}.${row.key}`;
    const list = byPath.get(path) ?? [];
    list.push(row);
    byPath.set(path, list);
  }

  const report: SyncReport = { added: 0, drifted: 0, removed: 0, unchanged: 0 };

  for (const [path, englishValue] of Object.entries(flat)) {
    const { namespace, key } = splitKey(path);
    const hash = sourceHash(englishValue);
    const rows = byPath.get(path) ?? [];
    const english = rows.find((r) => r.localeCode === DEFAULT_LOCALE);

    // The English row always mirrors the code exactly.
    await prisma.translationString.upsert({
      where: { namespace_key_localeCode: { namespace, key, localeCode: DEFAULT_LOCALE } },
      update: { value: englishValue, status: "translated", sourceHash: hash },
      create: {
        namespace,
        key,
        localeCode: DEFAULT_LOCALE,
        value: englishValue,
        status: "translated",
        sourceHash: hash,
      },
    });

    const sourceChanged = english !== undefined && english.sourceHash !== hash;
    if (english === undefined) report.added += 1;
    else if (sourceChanged) report.drifted += 1;
    else report.unchanged += 1;

    for (const { code } of locales) {
      if (code === DEFAULT_LOCALE) continue;
      const row = rows.find((r) => r.localeCode === code);

      if (!row) {
        await prisma.translationString.create({
          data: { namespace, key, localeCode: code, value: "", status: "missing", sourceHash: hash },
        });
        continue;
      }

      if (sourceChanged && row.status !== "missing") {
        await prisma.translationString.update({
          where: { id: row.id },
          data: { status: "needs_review", sourceHash: hash },
        });
      } else if (row.sourceHash !== hash) {
        await prisma.translationString.update({ where: { id: row.id }, data: { sourceHash: hash } });
      }
    }
  }

  // Keys no longer in code: mark, never delete.
  for (const [path, rows] of byPath) {
    if (path in flat) continue;
    for (const row of rows) {
      if (row.status === "removed") continue;
      await prisma.translationString.update({
        where: { id: row.id },
        data: { status: "removed" },
      });
      report.removed += 1;
    }
  }

  return report;
}

/**
 * The compiled catalogue for one locale, with the fallback chain applied:
 * requested locale, then its fallback, then the default. A missing string
 * renders in English — never as a raw key in front of a guest.
 */
export async function getUiMessages(locale: string): Promise<MessageTree> {
  const [rows, localeRow] = await Promise.all([
    prisma.translationString.findMany({
      where: { status: { not: "removed" } },
      select: { namespace: true, key: true, localeCode: true, value: true },
    }),
    prisma.locale.findUnique({ where: { code: locale } }),
  ]);

  const chain = [locale, localeRow?.fallbackCode, DEFAULT_LOCALE].filter(
    (c): c is string => Boolean(c),
  );

  const flat: FlatMessages = {};
  for (const row of rows) {
    const path = `${row.namespace}.${row.key}`;
    if (path in flat) continue;
    const best = chain
      .map((code) => rows.find((r) => r.localeCode === code && `${r.namespace}.${r.key}` === path))
      .find((r) => r?.value.trim());
    if (best) flat[path] = best.value;
  }

  return unflatten(flat);
}

export type LocaleCompleteness = {
  code: string;
  total: number;
  translated: number;
  missing: number;
  needsReview: number;
  machine: number;
  percent: number;
};

export async function getCompleteness(): Promise<LocaleCompleteness[]> {
  const locales = await prisma.locale.findMany({ orderBy: { displayOrder: "asc" } });
  const grouped = await prisma.translationString.groupBy({
    by: ["localeCode", "status"],
    where: { status: { not: "removed" } },
    _count: { _all: true },
  });

  return locales.map((l) => {
    const rows = grouped.filter((g) => g.localeCode === l.code);
    const count = (status: string) =>
      rows.find((r) => r.status === status)?._count._all ?? 0;
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const translated = count("translated");
    return {
      code: l.code,
      total,
      translated,
      missing: count("missing"),
      needsReview: count("needs_review"),
      machine: count("machine"),
      percent: total === 0 ? 0 : Math.round((translated / total) * 100),
    };
  });
}
