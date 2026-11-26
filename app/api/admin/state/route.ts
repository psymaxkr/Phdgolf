import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { adminState } from '@/lib/admin';
import { handle, slugOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  return handle(() => adminState(slugOf(req)));
}
