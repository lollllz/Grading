import pg from 'pg';
import { env, validateConnection, parseCookies, unseal } from './security.mjs';
const { Pool } = pg;
export function connectionFor(request) {
  const selected = unseal(parseCookies(request).gb_database, 'database');
  const raw = selected?.url || env('DATABASE_URL');
  return raw ? validateConnection(raw, Boolean(selected)) : null;
}
export function poolFor(connection) {
  if (!connection) throw Object.assign(new Error('Connect a database first, or use the browser demo.'), { status: 503 });
  return new Pool({ connectionString: connection.connectionString, ssl: connection.ssl, max: 2,
    connectionTimeoutMillis: 8000, idleTimeoutMillis: 1000, statement_timeout: 10000, query_timeout: 12000,
    application_name: 'gradebook' });
}
export async function inTransaction(pool, work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
