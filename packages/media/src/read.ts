import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT;
  if (!configured) return path.join(process.cwd(), ".media");
  if (!path.isAbsolute(configured) && process.env.NODE_ENV === "production") {
    throw new Error(
      "MEDIA_ROOT must be an absolute path — a relative one is not shared between the apps.",
    );
  }
  return path.resolve(configured);
}

const isSafeKey = (key: string) => /^\d{4}\/[0-9a-f-]{36}$/i.test(key);
const isSafeFilename = (name: string) => /^[a-z0-9]+\.(webp|avif|jpe?g|png|tiff?)$/i.test(name);

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}

/**
 * Read one stored file. The key and filename are both validated, and the
 * resolved path must stay inside MEDIA_ROOT — without that check a crafted
 * request could walk out of the directory and read anything the process can.
 */
export async function readMediaFile(
  storageKey: string,
  filename: string,
): Promise<{ body: Buffer; mime: string } | null> {
  if (!isSafeKey(storageKey) || !isSafeFilename(filename)) return null;

  const root = path.resolve(mediaRoot());
  const target = path.resolve(root, storageKey, filename);
  if (!target.startsWith(root + path.sep)) return null;

  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    return { body: await readFile(target), mime: mimeFor(path.extname(target)) };
  } catch {
    return null;
  }
}
