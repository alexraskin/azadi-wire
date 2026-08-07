import type { APIRoute } from 'astro';
import { getArticles, getReadDB } from '../../lib/db';
import { cacheControl } from '../../lib/cache';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || undefined;
  const source = url.searchParams.get('source') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const db = getReadDB((locals as any).runtime.env);
  const result = await getArticles(db, { topic, source, page, limit });

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl(),
    },
  });
};
