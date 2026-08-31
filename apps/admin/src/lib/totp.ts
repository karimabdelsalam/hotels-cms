import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238.
 *
 * Written out rather than taken as a dependency: it is forty lines of a fully
 * specified algorithm, and the SHA-1/6-digit/30-second parameters below are the
 * ones every authenticator app assumes. Changing any of them silently breaks
 * every already-enrolled phone, so they are constants, not options.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "sha1"; // what Google Authenticator, 1Password and Authy expect

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out; // no "=" padding: authenticator apps do not want it
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bits, matching the SHA-1 block the algorithm uses. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(ALGORITHM, key).update(message).digest();
  // Dynamic truncation, RFC 4226 §5.4: the low nibble of the last byte picks
  // where in the digest the code is read from.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentCode(secret: string, atMs: number = Date.now()): string {
  return codeAt(secret, Math.floor(atMs / 1000 / PERIOD));
}

/**
 * Accepts the current step and one either side.
 *
 * The window exists because phone clocks drift and people finish typing after
 * the code rolls. One step is 30 seconds, so this accepts a code for at most 90
 * seconds — wide enough to be usable, narrow enough that a shoulder-surfed code
 * is stale almost immediately.
 */
export function verifyCode(secret: string, submitted: string, atMs: number = Date.now()): boolean {
  const cleaned = submitted.replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return false;

  const step = Math.floor(atMs / 1000 / PERIOD);
  for (const counter of [step - 1, step, step + 1]) {
    const expected = Buffer.from(codeAt(secret, counter));
    const given = Buffer.from(cleaned);
    // Constant-time: a length check already passed, so the buffers match in
    // size and comparing them cannot leak how many leading digits were right.
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

/** The URI an authenticator app reads out of the QR code. */
export function enrolmentUri(secret: string, email: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Shown in groups of four so it can be typed by hand without losing your place. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
