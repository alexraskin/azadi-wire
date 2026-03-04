import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const RESEND_API_KEY: string | undefined = env.RESEND_API_KEY;
  const RESEND_AUDIENCE_ID: string | undefined = env.RESEND_AUDIENCE_ID;

  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    return new Response(JSON.stringify({ error: 'Newsletter service is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let email: string | null = null;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    email = params.get('email');
  } else if (contentType.includes('application/json')) {
    const body = await request.json();
    email = (body as any).email;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const referer = request.headers.get('referer') || '/subscribe';
    return Response.redirect(new URL('/subscribe?error=invalid', referer.startsWith('http') ? referer : `https://azadiwire.org${referer}`).toString(), 303);
  }

  const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  if (res.ok) {
    const RESEND_FROM_EMAIL: string = env.RESEND_FROM_EMAIL || 'Azadi Wire <digest@azadiwire.org>';
    await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          from: RESEND_FROM_EMAIL,
          to: [email],
          subject: 'Welcome to the Azadi Wire Daily Digest',
          html: `<p>Thanks for subscribing to the <strong>Azadi Wire Daily Digest</strong>.</p>
<p>You'll receive a morning roundup of top Iran news stories every day.</p>
<p>You can unsubscribe at any time from our <a href="https://azadiwire.org/terms">Terms</a> page.</p>`,
        },
      ]),
    }).catch(() => {/* best-effort — don't block redirect on email failure */});

    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/subscribe?success=true`, 303);
  }

  const errBody = await res.json().catch(() => ({}));
  const alreadyExists = res.status === 409 || (errBody as any)?.name === 'validation_error';

  const origin = new URL(request.url).origin;
  if (alreadyExists) {
    return Response.redirect(`${origin}/subscribe?error=exists`, 303);
  }

  return Response.redirect(`${origin}/subscribe?error=server`, 303);
};
