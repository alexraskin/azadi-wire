import type { APIRoute } from 'astro';
import { runFetcher } from '../../lib/fetcher';
import { getWriteDB } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;

  const secret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!secret || !token || token !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await runFetcher(getWriteDB(env), env.AI, env);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
