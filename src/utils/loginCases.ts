import { env } from './env';
import rawLoginCases from '../../test-data/login.json';

/**
 * test-data/login.json keeps no real credentials. Its rows refer to them with placeholders, which are
 * replaced here with the values from .env:
 *
 * - `{username}`       → ADMIN_USERNAME
 * - `{password}`       → ADMIN_PASSWORD
 * - `{password:upper}` → ADMIN_PASSWORD in upper case
 *
 * Variants such as "the right password with a trailing space" are therefore always built from the
 * real password of the environment under test, not from a hard-coded copy of it.
 */
function resolve(value: string): string {
  return value
    .replaceAll('{username}', env.admin.username)
    .replaceAll('{password:upper}', env.admin.password.toUpperCase())
    .replaceAll('{password}', env.admin.password);
}

export const loginCases = rawLoginCases.map((c) => ({
  ...c,
  username: resolve(c.username),
  password: resolve(c.password),
}));
