import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { VARIANTS, type Variant } from "./index";

/**
 * Files are written to MEDIA_ROOT on the local disk — no object storage, no
 * external dependency. On cPanel this points somewhere under public_html so
 * the web server serves them directly.
 */
export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT;
  if (!configured) return path.join(process.cwd(), ".media");
  // A relative MEDIA_ROOT resolves against each app's own working directory,
  // so the admin would write somewhere the public site never reads. Absolute
  // is the only correct setting once more than one app is running.
  if (!path.isAbsolute(configured) && process.env.NODE_ENV === "production") {
    throw new Error(
      "MEDIA_ROOT must be an absolute path — a relative one is not shared between the apps.",
    );
  }
  return path.resolve(configured);
}

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/tiff"]);
const MAX_BYTES = 25 * 1024 * 1024;

export type StoredMedia = {
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  placeholder: string;
};

export class MediaError extends Error {}

/**
 * Validate, then write the original plus one resized WebP and AVIF per
 * variant, plus a tiny inline placeholder so cards never reflow while an
 * image loads.
 */
export async function storeImage(file: {
  buffer: Buffer;
  mime: string;
  originalName: string;
}): Promise<StoredMedia> {
  if (!ACCEPTED.has(file.mime)) {
    throw new MediaError(
      `That file type is not supported. Use JPEG, PNG, WebP, AVIF or TIFF.`,
    );
  }
  if (file.buffer.byteLength > MAX_BYTES) {
    throw new MediaError(`That file is larger than 25 MB.`);
  }

  // Decode before trusting the declared type: a mislabelled or malformed file
  // fails here rather than being written to disk.
  let image = sharp(file.buffer, { failOn: "error" });
  let meta;
  try {
    meta = await image.metadata();
  } catch {
    throw new MediaError("That file could not be read as an image.");
  }
  if (!meta.width || !meta.height) {
    throw new MediaError("That image has no readable dimensions.");
  }

  // Strip EXIF (it carries GPS and camera serials) and honour rotation.
  image = image.rotate();

  const storageKey = `${new Date().getFullYear()}/${randomUUID()}`;
  const dir = path.join(mediaRoot(), storageKey);
  await mkdir(dir, { recursive: true });

  const originalExt = extFor(file.mime);
  await writeFile(path.join(dir, `original${originalExt}`), file.buffer);

  for (const [name, width] of Object.entries(VARIANTS) as [Variant, number][]) {
    if (meta.width < width && name !== "thumb") continue; // never upscale
    const resized = image.clone().resize({ width, withoutEnlargement: true });
    await Promise.all([
      resized.clone().webp({ quality: 82 }).toFile(path.join(dir, `${name}.webp`)),
      resized.clone().avif({ quality: 62 }).toFile(path.join(dir, `${name}.avif`)),
    ]);
  }

  const lqip = await image.clone().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
  const placeholder = `data:image/webp;base64,${lqip.toString("base64")}`;

  return {
    storageKey,
    mime: file.mime,
    width: meta.width,
    height: meta.height,
    bytes: file.buffer.byteLength,
    placeholder,
  };
}

const isSafeKey = (key: string) => /^\d{4}\/[0-9a-f-]{36}$/i.test(key);

export async function deleteMedia(storageKey: string): Promise<void> {
  if (!isSafeKey(storageKey)) throw new MediaError("Invalid media reference.");
  await rm(path.join(mediaRoot(), storageKey), { recursive: true, force: true });
}

function extFor(mime: string): string {
  switch (mime) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    case "image/avif": return ".avif";
    default: return ".tif";
  }
}

