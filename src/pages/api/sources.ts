import type { APIRoute } from 'astro';
import { getActiveSources } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).runtime.env.DB;
  const sources = await getActiveSources(db);

  return new Response(JSON.stringify({ sources }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
