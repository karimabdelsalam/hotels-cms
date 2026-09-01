/**
 * Reconcile the catalogues in code with the database.
 *
 * Run after any change to apps/web/messages/*.json. The release script does it
 * automatically, so a wording change in code always reaches the manager — and,
 * for locales other than English, reaches the site.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { syncTranslationKeys, importCatalogue, type MessageTree } from "./src/i18n";

const MESSAGES = path.join(__dirname, "../../apps/web/messages");

/** Every locale but English; English is the source the others are measured against. */
const TRANSLATED = ["ar"];

function read(locale: string): MessageTree | null {
  const file = path.join(MESSAGES, `${locale}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as MessageTree;
}

async function main() {
  const source = read("en");
  if (!source) throw new Error(`no en.json under ${MESSAGES}`);

  const report = await syncTranslationKeys(source);
  console.log(
    `  keys         +${report.added} new, ${report.drifted} drifted, ${report.removed} removed, ${report.unchanged} unchanged`,
  );

  for (const locale of TRANSLATED) {
    const translated = read(locale);
    if (!translated) continue;
    const r = await importCatalogue(locale, source, translated);
    const kept = r.skippedHumanEdited ? `, ${r.skippedHumanEdited} left alone (edited by hand)` : "";
    console.log(`  ${locale.padEnd(12)} ${r.imported} updated, ${r.unchanged} already current${kept}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
