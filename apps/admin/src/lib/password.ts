import { hash, verify } from "@node-rs/argon2";

/** argon2id, per docs/authorization.md. */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // A malformed digest is a failed login, never a crash.
    return false;
  }
}
