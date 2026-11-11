import { Resend } from 'resend';

import { INTEGRATION_UNAVAILABLE_MESSAGE, isIntegrationEnabled } from '@/lib/deployment-env';
import {
  addNewsletterSubscriber,
  ensureNewsletterTable,
  isNewsletterSubscribed,
} from '@/lib/newsletter-db';
import { getNewsletterWelcomePrompts } from '@/lib/prompts';

export const runtime = 'nodejs';

const WELCOME_SUBJECT = '\uD83C\uDFA8 Here are 5 free AI portrait prompts for you!';
const FROM_EMAIL = 'AQPrompts <hello@aqprompts.com>';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const recentAttempts = new Map();

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pruneMap(map, now, maxAge) {
  for (const [key, timestamp] of map.entries()) {
    if (now - timestamp > maxAge) {
      map.delete(key);
    }
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getFirstFivePrompts() {
  return getNewsletterWelcomePrompts();
}

function buildWelcomeEmail(prompts) {
  const promptItems = prompts
    .map((prompt) => {
      const title = escapeHtml(prompt.title || 'Untitled prompt');
      const promptText = escapeHtml(prompt.prompt || '');
      const description = escapeHtml(prompt.intro || prompt.bestUseCase || '');

      return `
        <li style="margin:0 0 24px;padding:20px;border:1px solid #f0d8cf;border-radius:12px;background:#fffaf8;">
          <h2 style="margin:0 0 10px;font-size:18px;line-height:1.35;color:#171717;">${title}</h2>
          ${description ? `<p style="margin:0 0 12px;color:#555;line-height:1.6;">${description}</p>` : ''}
          <p style="margin:0;color:#222;line-height:1.7;font-size:14px;"><strong>Prompt:</strong> ${promptText}</p>
        </li>
      `;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:28px;background:#ffffff;color:#171717;">
      <p style="margin:0 0 8px;color:#ff6b35;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">AQPrompts</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#171717;">Here are 5 free AI portrait prompts for you!</h1>
      <p style="margin:0 0 24px;color:#444;line-height:1.7;">Use these prompts with ChatGPT image generation, Midjourney, Leonardo AI, Gemini, or your favorite AI image tool.</p>
      <ol style="margin:0;padding:0 0 0 22px;">${promptItems}</ol>
      <p style="margin:28px 0 0;color:#666;line-height:1.6;">More creator-ready prompts are waiting at <a href="https://www.aqprompts.com/tools/ai-image-prompts" style="color:#ff6b35;">AQPrompts.com</a>.</p>
    </div>
  `;
}

export async function POST(request) {
  if (!isIntegrationEnabled('email')) {
    return Response.json(
      { error: INTEGRATION_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { email } = await request.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Newsletter email is not configured yet.' }, { status: 503 });
  }

  try {
    const now = Date.now();
    pruneMap(recentAttempts, now, RATE_LIMIT_WINDOW_MS);

    // The 6-hour dedupe used to live in an in-memory Map, which was lost
    // on every Worker restart. It now reads the stored subscribers table,
    // so a repeat subscribe never resends the welcome email.
    await ensureNewsletterTable();
    if (await isNewsletterSubscribed(normalizedEmail)) {
      return Response.json({ success: true, alreadySubscribed: true });
    }

    const lastAttemptAt = recentAttempts.get(normalizedEmail) || 0;
    if (now - lastAttemptAt < RATE_LIMIT_WINDOW_MS) {
      return Response.json({ error: 'Please wait a moment before trying again.' }, { status: 429 });
    }
    recentAttempts.set(normalizedEmail, now);

    const prompts = await getFirstFivePrompts();

    if (prompts.length === 0) {
      return Response.json({ error: 'No prompts are available for the welcome email.' }, { status: 500 });
    }

    // Send FIRST, then store: if the welcome email fails (502), no row
    // is inserted, so a later retry sends the email instead of hitting
    // the dedupe check and returning alreadySubscribed without resending.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [normalizedEmail],
      subject: WELCOME_SUBJECT,
      html: buildWelcomeEmail(prompts),
    });

    if (error) {
      return Response.json({ error: 'Could not send welcome email.' }, { status: 502 });
    }

    // Only store the subscriber after the welcome email was sent
    // successfully. If this insert fails, return a 500 (do not claim
    // success) and do NOT resend the email.
    try {
      await addNewsletterSubscriber(normalizedEmail);
    } catch (insertError) {
      console.error('Newsletter subscriber insert failed after welcome email was sent.', insertError);
      return Response.json(
        { error: 'Could not subscribe this email right now.' },
        { status: 500 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Newsletter subscription failed.', error);
    return Response.json(
      { error: 'Could not subscribe this email right now.' },
      { status: 500 },
    );
  }
}
