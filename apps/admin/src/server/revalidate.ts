import "server-only";

/**
 * Ask the public site to drop its cached pages. Best-effort: a publish should
 * not fail because the front end was briefly unreachable — the ISR window will
 * pick the change up anyway.
 */
export async function revalidatePublicSite(): Promise<"ok" | "skipped" | "failed"> {
  const url = process.env.WEB_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return "skipped";

  try {
    const response = await fetch(`${url}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}
