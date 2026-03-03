import type { APIRoute } from 'astro';
import { getTopicCounts } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).runtime.env.DB;
  const topics = await getTopicCounts(db);

  return new Response(JSON.stringify({ topics }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
