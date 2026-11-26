// 서버 전용 DB 연결 (Supabase PostgreSQL, 트랜잭션 풀러 사용)
import { Pool, PoolClient, types } from 'pg';

// DATE 컬럼은 문자열 그대로 (시간대 변환 방지)
types.setTypeParser(1082, (v: string) => v);
// bigint(count 등)는 숫자로
types.setTypeParser(20, (v: string) => Number(v));

declare global {
  // eslint-disable-next-line no-var
  var __phdPool: Pool | undefined;
}

function makePool() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) || process.env.DB_SSL === 'false';
  url.searchParams.delete('sslmode');
  return new Pool({
    connectionString: url.toString(),
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
}

export function pool() {
  if (!global.__phdPool) global.__phdPool = makePool();
  return global.__phdPool;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool().query(text, params);
  return r.rows as T[];
}
export async function q1<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function bump(eventId: string) {
  await q('select bump_sync($1)', [eventId]);
}
