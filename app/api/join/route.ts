import { join } from '@/lib/engine';
import { newToken } from '@/lib/auth';
import { handle, slugOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(() => join(slugOf(req), String(body.participantId ?? ''), String(body.code ?? ''), newToken()));
}
