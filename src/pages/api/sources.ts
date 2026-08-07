import type { APIRoute } from 'astro';
import { getActiveSources, getReadDB } from '../../lib/db';
import { cacheControl } from '../../lib/cache';

export const GET: APIRoute = async ({ locals }) => {
  const db = getReadDB((locals as any).runtime.env);
  const sources = await getActiveSources(db);

  return new Response(JSON.stringify({ sources }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl(),
    },
  });
};
