import { NextResponse } from "next/server";
import { readMediaFile } from "@fantazia/media/read";

/**
 * Streams a stored image. Used in development and on hosts without a static
 * mount; when NEXT_PUBLIC_MEDIA_URL_BASE points at a directory the web server
 * serves directly, this route is simply never hit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; key2: string; file: string }> },
) {
  const { key, key2, file } = await params;
  const found = await readMediaFile(`${key}/${key2}`, file);
  if (!found) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(found.body), {
    headers: {
      "Content-Type": found.mime,
      // Content is immutable: a new upload gets a new key rather than
      // replacing bytes at an existing one.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
