import { listNames } from '@/lib/engine';
import { handle, slugOf } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return handle(() => listNames(slugOf(req)));
}
