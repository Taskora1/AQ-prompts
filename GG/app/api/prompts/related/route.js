import { NextResponse } from 'next/server';

import { getRandomSlimPrompts } from '@/lib/prompts';
import { isAuditedNoIndexPromptSlug } from '@/lib/content-indexing-policy';

// Reads query params, so the handler must stay dynamic. Caching is handled by
// CDN headers (cache key includes the full URL incl. query params).
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 6;
// Fetch a few extra picks so the image/noindex filter still leaves `limit`
// results in the common case. The pick itself is cheap (md5 over ids only),
// and only the picked rows are fetched by id — the old blog-post flow
// shipped the full 576-prompt directory (~160 KB) to the client for a
// 3-card section.
const OVERFETCH = 12;

function slugToSeed(slug = '') {
  // Deterministic 32-bit hash of the post slug, so the same post always
  // gets the same related prompts (stable across requests and deploys).
  const input = String(slug || '').trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function toRelatedPromptItem(prompt) {
  return {
    id: prompt.id,
    title: prompt.title,
    slug: prompt.slug,
    image: prompt.image,
  };
}

async function pickRelated(slug, limit) {
  const seed = slugToSeed(slug);
  const seen = new Set();
  const picked = [];
  // First pick with the post seed; top up once with a different seed if the
  // image/noindex filter removed too many.
  for (const attemptSeed of [seed, seed + 1]) {
    if (picked.length >= limit) break;
    const candidates = await getRandomSlimPrompts(OVERFETCH, attemptSeed);
    for (const candidate of candidates) {
      if (picked.length >= limit) break;
      const candidateSlug = String(candidate?.slug || '').trim();
      if (!candidateSlug || seen.has(candidateSlug)) continue;
      seen.add(candidateSlug);
      if (!candidate?.title || !candidate?.image) continue;
      if (isAuditedNoIndexPromptSlug(candidateSlug)) continue;
      picked.push(toRelatedPromptItem(candidate));
    }
  }
  return picked;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = String(searchParams.get('slug') || '').trim();
    const requestedLimit = Number(searchParams.get('limit')) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
    if (!slug) {
      return NextResponse.json({ success: true, prompts: [] });
    }
    const prompts = await pickRelated(slug, limit);
    return NextResponse.json(
      { success: true, prompts },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    // The blog post renders fine without related prompts; return an empty
    // 200 so the client never logs a failed-resource console error.
    return NextResponse.json({ success: false, prompts: [] });
  }
}
