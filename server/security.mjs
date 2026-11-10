import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, scryptSync } from 'node:crypto';
export const env = name => globalThis.Netlify?.env?.get(name) || process.env[name];
export const hash = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export function sameSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
function encryptionKey() {
  const secret = env('GRADING_SESSION_SECRET');
  if (!secret || secret.length < 32) throw Object.assign(new Error('Set a server session secret of at least 32 characters before connecting.'), { status: 503 });
  return Buffer.from(hash(secret), 'hex');
}
export function seal(value, purpose) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal(value, purpose) {
  if (!value || value.length > 4000) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(bytes.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    return parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
export function parseCookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(s => s.trim().split(/=(.*)/s).slice(0,2)).filter(pair => pair.length === 2));
}
export function cookie(name, value, request, maxAge = 28800) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Object.assign(new Error('Use a password between 12 and 128 characters.'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [, salt, expected] = (stored || '').split(':');
  if (!salt || !expected) { scryptSync(password, 'unknown-account', 64); return false; }
  const actual = scryptSync(password, salt, 64); const bytes = Buffer.from(expected, 'hex');
  return bytes.length === actual.length && timingSafeEqual(actual, bytes);
}
export function validateConnection(value, fromForm = false) {
  if (typeof value !== 'string' || value.length > 1500) throw Object.assign(new Error('Enter a PostgreSQL connection URL (up to 1,500 characters).'), { status: 400 });
  let url; try { url = new URL(value.trim()); } catch { throw Object.assign(new Error('That connection URL is not valid.'), { status: 400 }); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.pathname.slice(1)) throw Object.assign(new Error('Use a postgres:// or postgresql:// URL with a username and database.'), { status: 400 });
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const allowLocal = local && env('GRADING_ALLOW_LOCAL_DB') === 'true';
  const isNeon = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/i.test(url.hostname);
  if (fromForm && !allowLocal && (!isNeon || (url.port && url.port !== '5432'))) throw Object.assign(new Error('The connection form accepts Neon hosts on port 5432. Configure other PostgreSQL servers with DATABASE_URL on the server.'), { status: 400 });
  if (local && env('GRADING_ALLOW_LOCAL_DB') !== 'true') throw Object.assign(new Error('Local database connections are disabled.'), { status: 400 });
  if (!local && !url.password) throw Object.assign(new Error('The database URL must include its password.'), { status: 400 });
  // Explicit pg options below own TLS; URL ssl parameters must not override certificate checks.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true },
    host: url.hostname, database: decodeURIComponent(url.pathname.slice(1)), provider: isNeon ? 'Neon' : 'PostgreSQL' };
}

export function adminConfigured() {
  return Boolean(env('GRADING_ADMIN_EMAIL') && env('GRADING_ADMIN_PASSWORD_HASH'));
}
export function adminSession(request) {
  if (!adminConfigured()) return null;
  const session = unseal(parseCookies(request).gb_admin, 'admin');
  if (!session || session.email !== env('GRADING_ADMIN_EMAIL').toLowerCase()
      || session.version !== hash(env('GRADING_ADMIN_PASSWORD_HASH'))) return null;
  return { ...session, user_id: null, full_name: 'Workspace administrator', role: 'admin' };
}
