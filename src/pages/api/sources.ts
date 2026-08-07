import type { APIRoute } from 'astro';
import { getActiveSources, getReadDB } from '../../lib/db';
import { env } from 'cloudflare:workers';
import { cacheControl } from '../../lib/cache';

export const GET: APIRoute = async ({ locals }) => {
  const db = getReadDB(env);
  const sources = await getActiveSources(db);

  return new Response(JSON.stringify({ sources }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl(),
    },
  });
};
