import type { APIRoute } from 'astro';
import { runFetcher } from '../../lib/fetcher';

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).runtime.env.DB;
  const result = await runFetcher(db);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
