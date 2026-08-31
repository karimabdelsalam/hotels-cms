import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

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

async function main() {
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
