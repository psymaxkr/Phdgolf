import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { adminAction } from '@/lib/admin';
import { handle, slugOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return handle(() => adminAction(slugOf(req), String(body.action ?? ''), body.params ?? {}));
}
