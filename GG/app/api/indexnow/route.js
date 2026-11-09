import { NextResponse } from 'next/server';

import { SITE_URL } from '@/lib/seo.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const INDEXNOW_KEY = '1c6ce672ef654a0791e3914d173dda18';
const INDEXNOW_KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_HOST = new URL(SITE_URL).hostname;

export const runtime = 'nodejs';

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const { urlList } = body || {};

  if (!Array.isArray(urlList) || urlList.length === 0) {
    return NextResponse.json(
      { error: 'urlList must be a non-empty array.' },
      { status: 400 },
    );
  }

  if (urlList.some((url) => typeof url !== 'string' || url.trim().length === 0)) {
    return NextResponse.json(
      { error: 'urlList must contain only non-empty strings.' },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList,
      }),
      cache: 'no-store',
    });

    if (response.ok) {
      return NextResponse.json(
        {
          success: true,
          message: 'URLs submitted to IndexNow.',
          status: response.status,
        },
        { status: response.status },
      );
    }

    const responseText = await response.text();
    return NextResponse.json(
      {
        error: 'IndexNow rejected the URL submission.',
        status: response.status,
        details: responseText || undefined,
      },
      { status: response.status },
    );
  } catch (error) {
    console.error('IndexNow submission error:', error);
    return NextResponse.json(
      { error: 'Could not reach the IndexNow service.' },
      { status: 502 },
    );
  }
}
