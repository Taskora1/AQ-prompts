import { Resend } from 'resend';

import { INTEGRATION_UNAVAILABLE_MESSAGE, isIntegrationEnabled } from '@/lib/deployment-env';
import { getRandomSlimPrompts } from '@/lib/prompts';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

export const runtime = 'nodejs';

const WEEKLY_SUBJECT = "\uD83D\uDD25 This week's top AI prompts from AQPrompts";
const FROM_EMAIL = 'AQPrompts <hello@aqprompts.com>';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getPrompts() {
  // Select only the five rows needed for the email at the database layer.
  return getRandomSlimPrompts(5);
}

function buildWeeklyEmail(prompts) {
  const promptItems = prompts
    .map((prompt) => {
      const title = escapeHtml(prompt.title || 'Untitled prompt');
      const promptText = escapeHtml(prompt.prompt || '');
      const description = escapeHtml(prompt.intro || prompt.bestUseCase || '');
      const slug = encodeURIComponent(prompt.slug || '');
      const promptUrl = slug ? `https://www.aqprompts.com/tools/ai-image-prompts/p/${slug}` : 'https://www.aqprompts.com/tools/ai-image-prompts';

      return `
        <li style="margin:0 0 24px;padding:20px;border:1px solid #f0d8cf;border-radius:12px;background:#fffaf8;">
          <h2 style="margin:0 0 10px;font-size:18px;line-height:1.35;color:#171717;">${title}</h2>
          ${description ? `<p style="margin:0 0 12px;color:#555;line-height:1.6;">${description}</p>` : ''}
          <p style="margin:0 0 14px;color:#222;line-height:1.7;font-size:14px;"><strong>Prompt:</strong> ${promptText}</p>
          <a href="${promptUrl}" style="color:#ff6b35;font-weight:700;">Open prompt</a>
        </li>
      `;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:28px;background:#ffffff;color:#171717;">
      <p style="margin:0 0 8px;color:#ff6b35;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">AQPrompts</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#171717;">This week's top AI prompts from AQPrompts</h1>
      <p style="margin:0 0 24px;color:#444;line-height:1.7;">Here are 5 creator-ready AI image prompts to share, test, or publish this week.</p>
      <ol style="margin:0;padding:0 0 0 22px;">${promptItems}</ol>
    </div>
  `;
}

export async function GET(request) {
  const readOnlyResponse = rejectPublicWriteWhenAdminOnly();
  if (readOnlyResponse) return readOnlyResponse;

  if (!isIntegrationEnabled('cron')) {
    return Response.json(
      { error: INTEGRATION_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || (authHeader !== `Bearer ${expectedToken}` && cronSecretHeader !== expectedToken)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const recipientEmail = process.env.WEEKLY_PROMPTS_TO;

  if (!process.env.RESEND_API_KEY || !recipientEmail) {
    return Response.json({ error: 'Weekly prompt email is not configured yet.' }, { status: 503 });
  }

  try {
    const prompts = await getPrompts();

    if (prompts.length === 0) {
      return Response.json({ error: 'No prompts are available for the weekly digest.' }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipientEmail],
      subject: WEEKLY_SUBJECT,
      html: buildWeeklyEmail(prompts),
    });

    if (error) {
      return Response.json({ error: 'Could not send weekly prompt digest.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: 'Could not send weekly prompt digest.' },
      { status: 500 },
    );
  }
}
