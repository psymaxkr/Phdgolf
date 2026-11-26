// 관리자 인증(서명 쿠키) 및 참석자 토큰
import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'phd_admin';

function secret() {
  // SESSION_SECRET이 없으면 DB 주소+관리자 비밀번호로 서버 전용 비밀값을 만듭니다 (브라우저에 노출되지 않음)
  const s = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`${process.env.DATABASE_URL ?? ''}|${process.env.ADMIN_PASSWORD ?? ''}`).digest('hex');
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD 환경변수가 필요합니다.');
  return s;
}
function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

export function checkPassword(pw: string) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(pw).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(real).digest('hex'));
  return crypto.timingSafeEqual(a, b);
}

export function makeAdminCookie() {
  const exp = Date.now() + 1000 * 60 * 60 * 24; // 24시간
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function isAdmin() {
  const v = cookies().get(COOKIE)?.value;
  if (!v) return false;
  const parts = v.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(parts[1]) > Date.now();
}

export const ADMIN_COOKIE = COOKIE;

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function randInt(maxExclusive: number) {
  return crypto.randomInt(0, maxExclusive);
}
export function secureRand() {
  return crypto.randomInt(0, 2 ** 31) / 2 ** 31;
}
