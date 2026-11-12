// apps/api/src/crypto.ts — password hashes are scrypt and session tokens are random; never log secrets.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error('Пароль должен содержать от 12 до 128 символов');
  const salt = randomBytes(24).toString('hex');
  const derived = (await scrypt(password, Buffer.from(salt, 'hex'), KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[0-9a-f]{48}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const derived = (await scrypt(password, Buffer.from(parts[1], 'hex'), KEY_LENGTH)) as Buffer;
  return timingSafeEqual(expected, derived);
}
