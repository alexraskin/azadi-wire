import type { APIRoute } from 'astro';
import { searchArticles, getReadDB } from '../../lib/db';

export const GET: APIRoute = async ({ url, locals }) => {
  const query = url.searchParams.get('q')?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing q parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const db = getReadDB((locals as any).runtime.env);

  const result = await searchArticles(db, query, { page, limit });

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=120',
    },
  });
};
