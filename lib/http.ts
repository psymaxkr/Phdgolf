import { NextResponse } from 'next/server';
import { AppError } from './engine';

export const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export function ok(data: any) {
  return NextResponse.json(data, { headers: noStore });
}

export async function handle(fn: () => Promise<any>) {
  try {
    return ok(await fn());
  } catch (e: any) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status, headers: noStore });
    console.error(e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500, headers: noStore });
  }
}

export function slugOf(req: Request) {
  const u = new URL(req.url);
  return u.searchParams.get('e') === 'demo' ? 'demo' : 'main';
}
export function tokenOf(req: Request) {
  return req.headers.get('x-phd-token');
}
