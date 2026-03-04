import type { APIRoute } from 'astro';
import { getArticleById, getArticleBySlug, getReadDB } from '../../../lib/db';

export const GET: APIRoute = async ({ params, locals }) => {
  const db = getReadDB((locals as any).runtime.env);
  let article = await getArticleBySlug(db, params.id!);
  if (!article) {
    article = await getArticleById(db, params.id!);
  }

  if (!article) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(article), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
};
