import { NextResponse } from "next/server";
import { prisma } from "@fantazia/db";

export const dynamic = "force-dynamic";

/**
 * Liveness plus a real dependency check. PM2 and any uptime monitor should
 * watch this rather than the homepage — a cached page can look healthy while
 * the database is unreachable.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "up", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "down", ms: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
