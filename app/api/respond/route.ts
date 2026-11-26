import { respond } from '@/lib/engine';
import { handle, slugOf, tokenOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(() => respond(slugOf(req), tokenOf(req), body));
}
