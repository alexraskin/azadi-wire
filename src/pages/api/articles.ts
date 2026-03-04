import type { APIRoute } from 'astro';
import { getArticles } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || undefined;
  const source = url.searchParams.get('source') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const db = (locals as any).runtime.env.DB;
  const result = await getArticles(db, { topic, source, page, limit });

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=120',
    },
  });
};
