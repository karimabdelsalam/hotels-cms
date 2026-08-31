import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * Generated stand-ins for photography.
 *
 * Deliberately abstract. A convincing fake photograph is worse than an obvious
 * placeholder: it survives review, ships, and a hotel group ends up marketing
 * rooms nobody can recognise. These read as artwork at a glance — enough to
 * judge layout, cropping and rhythm, never enough to be mistaken for the real
 * thing.
 *
 * Deterministic: the same subject always produces the same image, so
 * re-running the seed does not reshuffle the whole site.
 */

/** The Red Sea palette the site is built on. */
const PALETTES: [string, string, string][] = [
  ["#7bf0e2", "#0bb8b0", "#05506d"], // shallow reef
  ["#a9f3e4", "#12bfb6", "#03404f"], // lagoon
  ["#ffd9a8", "#f4a26b", "#0d5f72"], // sunset over water
  ["#cdf5ee", "#4fd4c4", "#073c52"], // morning
  ["#ffe4c4", "#e88a5f", "#7a2f3a"], // desert dusk
  ["#bde9f5", "#3aa6c9", "#062f45"], // deep water
];

function seedOf(subject: string): number {
  return parseInt(createHash("sha256").update(subject).digest("hex").slice(0, 8), 16);
}

/** A tiny deterministic generator, so one seed drives the whole composition. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export type Placeholder = {
  buffer: Buffer;
  mime: string;
  originalName: string;
};

export async function makePlaceholder(
  subject: string,
  width = 2400,
  height = 1600,
): Promise<Placeholder> {
  const seed = seedOf(subject);
  const random = rng(seed);
  const [light, mid, deep] = PALETTES[seed % PALETTES.length]!;

  const horizon = 0.42 + random() * 0.2;
  const sunX = 0.2 + random() * 0.6;
  const sunY = horizon - 0.06 - random() * 0.16;
  const sunR = 0.06 + random() * 0.05;

  const bands = Array.from({ length: 5 }, (_, i) => {
    const y = horizon + (i + 1) * ((1 - horizon) / 6) + (random() - 0.5) * 0.02;
    const opacity = (0.16 - i * 0.02).toFixed(3);
    const amp = 0.008 + random() * 0.014;
    return `<path d="M0 ${y * height} Q ${width * 0.25} ${(y - amp) * height} ${width * 0.5} ${y * height} T ${width} ${y * height} L ${width} ${height} L 0 ${height} Z" fill="${light}" opacity="${opacity}"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="${(horizon * 100).toFixed(1)}%" stop-color="${mid}"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${horizon * height}" fill="url(#sky)"/>
  <rect y="${horizon * height}" width="${width}" height="${(1 - horizon) * height}" fill="url(#sea)"/>
  <circle cx="${sunX * width}" cy="${sunY * height}" r="${sunR * width}" fill="url(#glow)"/>
  <circle cx="${sunX * width}" cy="${sunY * height}" r="${sunR * width * 0.45}" fill="#fff" opacity="0.85"/>
  ${bands}
</svg>`;

  // Through sharp so the output is a real JPEG with real dimensions — the
  // media pipeline must treat these exactly as it treats an upload.
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

  return {
    buffer,
    mime: "image/jpeg",
    originalName: `placeholder-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.jpg`,
  };
}

/** A shallower crop, for room cards. */
export function makeRoomPlaceholder(subject: string): Promise<Placeholder> {
  return makePlaceholder(subject, 1800, 1350);
}
