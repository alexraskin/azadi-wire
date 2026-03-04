import type { APIRoute } from 'astro';
import { getArticleById, getArticleBySlug } from '../../../lib/db';

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (locals as any).runtime.env.DB;
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
