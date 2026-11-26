import { NextResponse } from 'next/server';
import { checkPassword, makeAdminCookie, ADMIN_COOKIE } from '@/lib/auth';
export const dynamic = 'force-dynamic';

const attempts = new Map<string, { n: number; t: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  const a = attempts.get(ip) ?? { n: 0, t: Date.now() };
  if (Date.now() - a.t > 60_000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return NextResponse.json({ error: '시도가 너무 많습니다. 1분 뒤 다시 시도하세요.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(String(body.password ?? ''))) {
    a.n++;
    attempts.set(ip, a);
    return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, makeAdminCookie(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 });
  return res;
}
