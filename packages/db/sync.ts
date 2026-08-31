/**
 * Reconcile the English catalogue in code with the database.
 *
 * Run after any change to apps/web/messages/en.json. The deploy script does it
 * automatically, so a wording change in code always reaches the manager.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { syncTranslationKeys, type MessageTree } from "./src/i18n";

async function main() {
  const source = JSON.parse(
    readFileSync(path.join(__dirname, "../../apps/web/messages/en.json"), "utf8"),
  ) as MessageTree;

  const report = await syncTranslationKeys(source);
  console.log(
    `added ${report.added} · drifted ${report.drifted} · removed ${report.removed} · unchanged ${report.unchanged}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
