import type { APIRoute } from 'astro';
import { getRecentFetcherRuns, getReadDB } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const secret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!secret || !token || token !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = getReadDB(env);

  const runs = await getRecentFetcherRuns(db, 20);
  const latest = runs[0] ?? null;

  const totalInserted = runs.reduce((sum, r) => sum + r.inserted, 0);
  const totalErrors = runs.reduce((sum, r) => sum + r.errors, 0);
  const avgDuration = runs.length
    ? Math.round(runs.reduce((sum, r) => sum + r.duration_ms, 0) / runs.length)
    : 0;

  return new Response(
    JSON.stringify({
      ok: true,
      latest_run: latest,
      recent_runs: runs.length,
      total_inserted: totalInserted,
      total_errors: totalErrors,
      avg_duration_ms: avgDuration,
      runs,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
      },
    }
  );
};
