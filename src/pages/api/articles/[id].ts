import type { APIRoute } from 'astro';
import { getArticleById, getArticleBySlug, getReadDB } from '../../../lib/db';
import { ARTICLE_TTL, cacheControl } from '../../../lib/cache';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params, locals }) => {
  const db = getReadDB(env);
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
      // An article never changes after insert.
      'Cache-Control': cacheControl(ARTICLE_TTL),
    },
  });
};
