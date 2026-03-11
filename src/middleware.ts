import { defineMiddleware } from 'astro:middleware';

const ALLOWED_ORIGINS = [
  'https://azadiwire.org',
  'https://www.azadiwire.org',
];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-XSS-Protection': '0',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  const url = new URL(requestUrl);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  }

  return false;
}

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');

    // One-click unsubscribe from email clients sends POST without origin
    const isUnsubscribe = url.pathname === '/api/unsubscribe';

    if (!isUnsubscribe) {
      if (!origin || !isAllowedOrigin(origin, request.url)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  const response = await next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  if (url.pathname.startsWith('/api/')) {
    response.headers.set('X-Robots-Tag', 'noindex');
  }

  return response;
});
