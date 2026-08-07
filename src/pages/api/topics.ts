import type { APIRoute } from 'astro';
import { getTopicCounts, getReadDB } from '../../lib/db';
import { cacheControl } from '../../lib/cache';

export const GET: APIRoute = async ({ locals }) => {
  const db = getReadDB((locals as any).runtime.env);
  const topics = await getTopicCounts(db);

  return new Response(JSON.stringify({ topics }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl(),
    },
  });
};
