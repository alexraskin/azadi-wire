import type { APIRoute } from 'astro';
import { getResendClient } from '../../lib/resend';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const resend = getResendClient(env);
  const audienceId: string | undefined = env.RESEND_AUDIENCE_ID;

  if (!resend || !audienceId) {
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
    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/subscribe?error=invalid`, 303);
  }

  const { error } = await resend.contacts.create({
    audienceId,
    email,
    unsubscribed: false,
  });

  if (error) {
    const origin = new URL(request.url).origin;
    if (error.name === 'validation_error') {
      return Response.redirect(`${origin}/subscribe?error=exists`, 303);
    }
    return Response.redirect(`${origin}/subscribe?error=server`, 303);
  }

  const fromEmail: string | undefined = env.RESEND_FROM_EMAIL;
  if (fromEmail) {
    const unsubscribeUrl = `https://azadiwire.org/api/unsubscribe?email=${encodeURIComponent(email)}`;
    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: 'Welcome to the Azadi Wire Daily Digest',
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: `<p>Thanks for subscribing to the <strong>Azadi Wire Daily Digest</strong>.</p>
<p>You'll receive a morning roundup of top Iran news stories every day.</p>
<p>You can <a href="${unsubscribeUrl}">unsubscribe</a> at any time.</p>`,
    }).catch(() => {});
  }

  const origin = new URL(request.url).origin;
  return Response.redirect(`${origin}/subscribe?success=true`, 303);
};
