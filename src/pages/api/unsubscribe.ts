import type { APIRoute } from 'astro';
import { getResendClient } from '../../lib/resend';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const resend = getResendClient(env);
  const audienceId: string | undefined = env.RESEND_AUDIENCE_ID;
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.trim().slice(0, 254) || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.redirect(`${url.origin}/unsubscribe?error=missing`, 303);
  }

  if (!resend || !audienceId) {
    return Response.redirect(`${url.origin}/unsubscribe?error=server`, 303);
  }

  await resend.contacts.remove({ audienceId, email });

  return Response.redirect(`${url.origin}/unsubscribe?success=true`, 303);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const resend = getResendClient(env);
  const audienceId: string | undefined = env.RESEND_AUDIENCE_ID;
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.trim().slice(0, 254) || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !resend || !audienceId) {
    return new Response('', { status: 400 });
  }

  await resend.contacts.remove({ audienceId, email });

  return new Response('', { status: 200 });
};
