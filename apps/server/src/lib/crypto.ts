import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { type Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

// `Algorithm.Argon2id`; the package's const enum can't be imported as a value here.
const ARGON2ID = 2 as Algorithm;

// Only used to check hashes from before the switch to argon2id.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEYLEN = 32;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/**
 * Passwords are hashed with argon2id (the library's defaults are OWASP's recommended minimum:
 * 19 MiB, 2 passes). Hashes from older versions (`scrypt$…`) still verify, and are replaced
 * with argon2id the next time that person signs in (see `needsRehash`).
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password.normalize('NFKC'), { algorithm: ARGON2ID });
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so a missing account isn't distinguishable by timing.
    await hashPassword(password);
    return false;
  }
  if (stored.startsWith('$argon2')) {
    try {
      return await argon2Verify(stored, password.normalize('NFKC'));
    } catch {
      return false;
    }
  }
  const [alg, , , , salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64url'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True for hashes made before argon2id; replace them after a successful sign-in. */
export const needsRehash = (stored: string) => !stored.startsWith('$argon2id$');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
