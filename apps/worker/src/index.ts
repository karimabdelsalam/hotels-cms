import { prisma } from "@fantazia/db";
import { JOBS } from "./jobs";

/**
 * The background worker.
 *
 * One process, a plain interval, no queue server. That is a deliberate size
 * choice: this runs on one VPS behind cPanel, the work is a handful of
 * database reads and at most twenty OPERA calls a minute, and a Redis-backed
 * queue would be one more thing to install, monitor and get paged about for no
 * benefit at this scale.
 *
 * What it must never do is overlap with itself. Two passes running at once
 * could both pick up the same booking and both create a reservation for it,
 * which is exactly the failure the rest of the system works to prevent.
 *
 *   pnpm --filter @fantazia/worker start        # the loop
 *   pnpm --filter @fantazia/worker once         # a single pass, for cron or by hand
 */

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
const ONCE = process.argv.includes("--once");

let running = false;
let stopping = false;

function log(line: string): void {
  // Plain stdout: PM2 captures it, timestamps it, and rotates it. A logging
  // library here would add a dependency to say the same thing.
  console.log(`[worker] ${line}`);
}

async function pass(): Promise<void> {
  if (running) {
    // The previous pass is still going. Skipping is right: the work is
    // idempotent but overlapping passes could both claim the same booking.
    log("previous pass still running — skipped");
    return;
  }
  running = true;
  const started = Date.now();

  try {
    for (const job of JOBS) {
      if (stopping) break;
      const result = await job();
      // Quiet jobs stay quiet. A log that says "nothing due" sixty times an
      // hour is a log nobody reads, and the warnings are what matter here.
      const boring =
        !result.failed &&
        /^(nothing due|none stale|nothing to purge|empty|all present|nothing queued)$/.test(
          result.summary,
        );
      if (!boring) log(`${result.name}: ${result.summary}`);
    }
  } finally {
    running = false;
    const ms = Date.now() - started;
    if (ms > 30_000) log(`pass took ${Math.round(ms / 1000)}s`);
  }
}

async function shutdown(signal: string): Promise<void> {
  log(`${signal} — finishing the current pass`);
  stopping = true;
  // Give an in-flight reservation call a chance to land. Killing mid-call is
  // how a response gets lost, and a lost response is the expensive case.
  const deadline = Date.now() + 20_000;
  while (running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await prisma.$disconnect().catch(() => undefined);
  log("stopped");
  process.exit(0);
}

async function main(): Promise<void> {
  if (ONCE) {
    log("single pass");
    await pass();
    await prisma.$disconnect();
    return;
  }

  log(`started · every ${Math.round(INTERVAL_MS / 1000)}s`);
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await pass();
  // The interval is what keeps the process alive, deliberately. Unref-ing it
  // and relying on the database pool to hold the event loop open would work
  // today and stop working the moment the pool idles out.
  setInterval(() => void pass(), INTERVAL_MS);
}

main().catch(async (error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
