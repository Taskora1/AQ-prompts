import { NextResponse } from 'next/server';

import { INTEGRATION_UNAVAILABLE_MESSAGE, isIntegrationEnabled } from '@/lib/deployment-env';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

const SCRIPT_URL = process.env.PROMPTSHE_TRIAL_WEB_APP_URL;
const SCRIPT_SHARED_SECRET = process.env.PROMPTSHE_TRIAL_SHARED_SECRET;
const DEFAULT_COUNTRY_CODE = '92';

function cleanText(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}


function blockDuplicateJoinLink(payload = {}) {
  const message = cleanText(payload.message).toLowerCase();
  const type = cleanText(payload.type).toLowerCase();
  const looksLikeDuplicate =
    type === 'already_active' ||
    message.includes('already active') ||
    message.includes('already registered') ||
    message.includes('already joined') ||
    message.includes('already used');

  if (!looksLikeDuplicate) return payload;

  return {
    ...payload,
    success: false,
    joinLink: '',
    type: type || 'duplicate_number',
    message: payload.paymentLink
      ? payload.message
      : 'This WhatsApp number is already registered. Please contact admin or purchase a membership to join again.',
  };
}

function normalizePhone(value = '', countryCode = DEFAULT_COUNTRY_CODE) {
  let number = String(value || '').replace(/[\s\-()]/g, '').trim();
  const normalizedCountryCode = String(countryCode || DEFAULT_COUNTRY_CODE).replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;

  number = number.replace(/[^\d+]/g, '');
  if (number.startsWith('00')) number = number.slice(2);
  if (number.startsWith('+')) number = number.slice(1);
  if (number.startsWith('0')) number = `${normalizedCountryCode}${number.slice(1)}`;

  return number.replace(/\D/g, '');
}

function sanitizeVerificationPayload(payload = {}) {
  const safePayload = {
    success: payload.success === true,
    type: cleanText(payload.type),
    message: cleanText(payload.message),
  };

  if (payload.success === true && typeof payload.joinLink === 'string') {
    safePayload.joinLink = payload.joinLink;
  }

  if (typeof payload.paymentLink === 'string') {
    safePayload.paymentLink = payload.paymentLink;
  }

  return safePayload;
}

export async function POST(request) {
  const readOnlyResponse = rejectPublicWriteWhenAdminOnly();
  if (readOnlyResponse) return readOnlyResponse;

  if (!isIntegrationEnabled('promptsheTrial')) {
    return NextResponse.json(
      { success: false, type: 'unavailable', message: INTEGRATION_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!SCRIPT_URL || !SCRIPT_SHARED_SECRET) {
    return NextResponse.json(
      {
        success: false,
        type: 'setup_required',
        message: 'Promptshe verification is not configured yet.',
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const name = cleanText(body.name);
    const countryCode = cleanText(body.countryCode || DEFAULT_COUNTRY_CODE).replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;
    const phone = normalizePhone(body.phone, countryCode);

    if (!name || !phone) {
      return NextResponse.json(
        {
          success: false,
          type: 'validation_error',
          message: 'Please enter your name and WhatsApp number with country code.',
        },
        { status: 400 }
      );
    }

    const scriptResponse = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ name, phone, countryCode, sharedSecret: SCRIPT_SHARED_SECRET }),
      cache: 'no-store',
    });

    const text = await scriptResponse.text();
    let payload;

    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('The verification server returned an invalid response.');
    }

    const guardedPayload = sanitizeVerificationPayload(blockDuplicateJoinLink(payload));

    return NextResponse.json(guardedPayload, {
      status: scriptResponse.ok ? 200 : 502,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        type: 'server_error',
        message: 'Unable to verify your trial right now.',
      },
      { status: 500 }
    );
  }
}
