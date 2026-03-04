import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const RESEND_API_KEY: string | undefined = env.RESEND_API_KEY;
  const RESEND_AUDIENCE_ID: string | undefined = env.RESEND_AUDIENCE_ID;

  const url = new URL(request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return Response.redirect(`${url.origin}/unsubscribe?error=missing`, 303);
  }

  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    return Response.redirect(`${url.origin}/unsubscribe?error=server`, 303);
  }

  const res = await fetch(
    `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
    }
  );

  if (res.ok || res.status === 404) {
    return Response.redirect(`${url.origin}/unsubscribe?success=true`, 303);
  }

  return Response.redirect(`${url.origin}/unsubscribe?error=server`, 303);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const RESEND_API_KEY: string | undefined = env.RESEND_API_KEY;
  const RESEND_AUDIENCE_ID: string | undefined = env.RESEND_AUDIENCE_ID;

  const url = new URL(request.url);
  const email = url.searchParams.get('email');

  if (!email || !RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    return new Response('', { status: 400 });
  }

  await fetch(
    `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
    }
  );

  return new Response('', { status: 200 });
};
