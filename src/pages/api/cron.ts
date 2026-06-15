import type { APIRoute } from 'astro';
import { runFetcher } from '../../lib/fetcher';
import { getWriteDB } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const ctx = (locals as any).runtime.ctx;

  const secret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!secret || !token || token !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Run the fetcher as background work so the response returns immediately and
  // the run survives the request lifecycle (Workers kills the isolate once the
  // response is sent unless work is registered via waitUntil).
  const work = runFetcher(getWriteDB(env), env.AI, env);
  if (ctx?.waitUntil) {
    ctx.waitUntil(work);
  } else {
    // No execution context (e.g. local dev) — fall back to awaiting inline.
    await work;
  }

  return new Response(JSON.stringify({ ok: true, message: 'Fetcher started' }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
