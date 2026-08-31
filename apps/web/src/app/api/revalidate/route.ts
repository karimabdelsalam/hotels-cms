import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * Lets the admin push a change through immediately instead of waiting out the
 * five-minute ISR window. Shared-secret authenticated: this clears the cache
 * for the whole site, so it must not be open.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Revalidation is not configured" }, { status: 501 });
  }
  if (request.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
