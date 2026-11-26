import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { exportCsv } from '@/lib/admin';
import { slugOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const csv = await exportCsv(slugOf(req));
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="phd-play-2026-${slugOf(req)}-result.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
