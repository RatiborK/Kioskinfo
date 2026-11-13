// apps/api/src/crypto.ts — scrypt password hashes, random session tokens and independent local-preview policy.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }
async function hashWithMinimumLength(password: string, minimum: number): Promise<string> {
  if (typeof password !== 'string' || password.length < minimum || password.length > 128)
    throw new Error('Пароль должен содержать от ' + minimum + ' до 128 символов');
  const salt = randomBytes(24).toString('hex');
  const derived = (await scrypt(password, Buffer.from(salt, 'hex'), KEY_LENGTH)) as Buffer;
  return 'scrypt' + '$' + salt + '$' + derived.toString('hex');
}
// Production-facing accounts always require at least 12 characters.
export function hashPassword(password: string): Promise<string> {
  return hashWithMinimumLength(password, 12);
}
// Local preview only; index-preview.ts never binds to the LAN.
export function hashLocalPreviewPassword(password: string): Promise<string> {
  return hashWithMinimumLength(password, 8);
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[0-9a-f]{48}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const derived = (await scrypt(password, Buffer.from(parts[1], 'hex'), KEY_LENGTH)) as Buffer;
  return timingSafeEqual(expected, derived);
}
