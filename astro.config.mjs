// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { execSync } from 'node:child_process';

// Resolve the deployed commit SHA. Cloudflare Workers Builds sets
// WORKERS_CI_COMMIT_SHA in the build env. Fall back to local git for dev, and
// to 'dev' if git is unavailable.
function getCommitSha() {
  const fromCI = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  site: 'https://azadiwire.org',
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
  }),
  // The app stores no session state. Left on, the Cloudflare adapter injects a
  // "SESSION" KV binding with no namespace id, which deploys cannot resolve.
  session: false,
  integrations: [sitemap()],
  vite: {
    define: {
      'import.meta.env.PUBLIC_COMMIT_SHA': JSON.stringify(getCommitSha()),
    },
  },
});
