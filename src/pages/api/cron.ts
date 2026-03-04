import type { APIRoute } from 'astro';
import { runFetcher } from '../../lib/fetcher';
import { getWriteDB } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;

  const secret = env.CRON_SECRET;
  if (secret) {
    const token = new URL(request.url).searchParams.get('token');
    if (token !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const result = await runFetcher(getWriteDB(env), env.AI, env);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
