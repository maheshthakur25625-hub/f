import { randomBytes } from 'node:crypto';

/** Short, URL-safe identifiers for domain records. */
export function id(prefix = ''): string {
  return prefix + randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

export function token(): string {
  return randomBytes(24).toString('base64url');
}
