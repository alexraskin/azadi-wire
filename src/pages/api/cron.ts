import type { APIRoute } from 'astro';
import { runFetcher } from '../../lib/fetcher';
import { getWriteDB } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime.env;
  const result = await runFetcher(getWriteDB(env), env.AI);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
