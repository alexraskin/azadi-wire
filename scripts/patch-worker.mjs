/**
 * Post-build script that patches the Astro-generated worker to include
 * a Cloudflare scheduled() handler for cron triggers. The scheduled
 * handler dispatches an internal request to /api/cron which runs the
 * RSS fetcher pipeline.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WORKER_PATH = 'dist/_worker.js/index.js';

let code = readFileSync(WORKER_PATH, 'utf-8');

const scheduledHandler = `
// --- Patched: scheduled handler for cron triggers ---
const _original = __astrojsSsrVirtualEntry;
const _patched = {
  fetch: _original.fetch.bind(_original),
  async scheduled(controller, env, ctx) {
    const token = env.CRON_SECRET || '';
    const request = new Request('http://localhost/api/cron', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    await _original.fetch(request, env, { waitUntil: ctx.waitUntil.bind(ctx) });
  }
};
export { _patched as default, pageMap };
`;

const patched = code.replace(
  /export\s*\{\s*__astrojsSsrVirtualEntry\s+as\s+default\s*,\s*pageMap\s*\}\s*;/,
  scheduledHandler
);

if (patched === code) {
  console.error(
    'ERROR: Patch target not found in worker bundle. Cron scheduled() handler NOT installed. ' +
      'Astro may have changed its export signature — update the regex in scripts/patch-worker.mjs.'
  );
  process.exit(1);
}

writeFileSync(WORKER_PATH, patched, 'utf-8');
console.log('Patched worker with scheduled handler.');
