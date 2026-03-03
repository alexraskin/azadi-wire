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
    const request = new Request('http://localhost/api/cron');
    await _original.fetch(request, env, { waitUntil: ctx.waitUntil.bind(ctx) });
  }
};
export { _patched as default, pageMap };
`;

code = code.replace(
  /export\s*\{\s*__astrojsSsrVirtualEntry\s+as\s+default\s*,\s*pageMap\s*\}\s*;/,
  scheduledHandler
);

writeFileSync(WORKER_PATH, code, 'utf-8');
console.log('Patched worker with scheduled handler.');
