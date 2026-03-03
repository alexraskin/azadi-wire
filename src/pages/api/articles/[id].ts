import type { APIRoute } from 'astro';
import { getArticleById } from '../../../lib/db';

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (locals as any).runtime.env.DB;
  const article = await getArticleById(db, params.id!);

  if (!article) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(article), {
    headers: { 'Content-Type': 'application/json' },
  });
};
