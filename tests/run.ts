import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@fantazia/db";

/**
 * Runs every *.test.ts in this directory, in its own process.
 *
 * Separate processes on purpose: these tests share one database and a
 * simulator that persists, so a test that leaves state behind must not be able
 * to leak module-level state into the next one as well. A failing file fails
 * the run; the rest still run, because knowing about three failures beats
 * finding out about them one deploy at a time.
 */

const here = __dirname;
const files = readdirSync(here).filter((f) => f.endsWith(".test.ts")).sort();

if (files.length === 0) {
  console.error("No tests found.");
  process.exit(1);
}

const run = (file: string) =>
  new Promise<boolean>((resolve) => {
    const child = spawn("npx", ["tsx", path.join(here, file)], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code === 0));
  });

/**
 * These tests read real availability, so an unseeded database makes every one
 * of them fail on something unrelated to what it is testing. Said plainly here
 * rather than discovered from a stack trace.
 */
async function requireSeed(): Promise<void> {
  try {
    const [resorts, inventory] = await Promise.all([
      prisma.resort.count(),
      prisma.inventorySnapshot.count(),
    ]);
    if (resorts === 0 || inventory === 0) {
      console.error(
        `\nThe database is not seeded (${resorts} resorts, ${inventory} inventory rows).\n` +
          "Run:  pnpm db:seed && pnpm --filter @fantazia/db seed:booking\n",
      );
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // No schema and no seed need different fixes, so they get different
    // instructions rather than one vague "check the database".
    const noSchema = /does not exist in the current database/.test(message);
    console.error(
      noSchema
        ? "\nThe database has no schema yet.\nRun:  pnpm db:deploy && pnpm db:seed && pnpm --filter @fantazia/db seed:booking\n"
        : `\nCould not reach the database: ${message}\n` +
          "Check DATABASE_URL and that Postgres is running.\n",
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  await requireSeed();
  const failed: string[] = [];
  for (const file of files) {
    console.log(`\n\x1b[1m── ${file} ${"─".repeat(Math.max(0, 60 - file.length))}\x1b[0m`);
    if (!(await run(file))) failed.push(file);
  }

  console.log(
    failed.length === 0
      ? `\n\x1b[32mAll ${files.length} test file${files.length === 1 ? "" : "s"} passed.\x1b[0m`
      : `\n\x1b[31m${failed.length} of ${files.length} failed: ${failed.join(", ")}\x1b[0m`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
