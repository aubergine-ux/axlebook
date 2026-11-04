import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEYLEN = 32;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so a missing account isn't distinguishable by timing.
    await scryptAsync(password, randomBytes(16));
    return false;
  }
  const [alg, , , , salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64url'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
