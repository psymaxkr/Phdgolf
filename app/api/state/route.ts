import { participantState } from '@/lib/engine';
import { handle, slugOf, tokenOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return handle(() => participantState(slugOf(req), tokenOf(req)));
}
