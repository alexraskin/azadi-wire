import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison. Returns false on length mismatch without
 * leaking timing of the content comparison. nodejs_compat must be enabled.
 */
function safeCompare(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Validates a request against CRON_SECRET via the Authorization: Bearer header.
 * Returns true only when the secret is configured and the token matches.
 */
export function checkBearerAuth(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return false;
  return safeCompare(token, secret);
}
