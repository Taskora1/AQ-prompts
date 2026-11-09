import { createHmac } from 'node:crypto';

import { getPgPool } from './db.js';

export const PUBLIC_REVIEW_PAGE_SIZE = 20;
export const ADMIN_REVIEW_PAGE_SIZE = 100;
export const REVIEW_SUBMISSION_LIMIT = 5;
export const REVIEW_SUBMISSION_WINDOW_HOURS = 1;

export function hashReviewIp(ipAddress) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set to protect review IP fingerprints.');
  return createHmac('sha256', secret)
    .update(String(ipAddress || 'unknown'))
    .digest('hex');
}

export function normalizeReviewSocialUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') {
    throw new Error('Social profile links must use HTTPS.');
  }
  url.hostname = url.hostname.replace(/^www\./i, '');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function mapReview(row, {
  includeUserAgent = false,
  includeProfile = false,
} = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name || '',
    ...(includeProfile ? {
      profileImageUrl: row.profile_image_url || '',
      socialUrl: row.social_url || '',
    } : {}),
    rating: Number(row.rating),
    text: row.review_text,
    status: row.status,
    source: row.source,
    promptId: row.prompt_id == null ? null : Number(row.prompt_id),
    createdAt: row.created_at || '',
    ...(includeUserAgent ? { userAgent: row.user_agent || '' } : {}),
  };
}

export async function submitSiteReview({
  name = '',
  socialUrl = '',
  rating,
  text,
  source = 'website',
  promptId = null,
  ipHash,
  userAgent = '',
}) {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`site-review-profile:${socialUrl.toLowerCase()}`],
    );
    const duplicateResult = await client.query(
      `
        SELECT 1
        FROM public.site_reviews
        WHERE status IN ('pending', 'approved')
          AND lower(regexp_replace(
            regexp_replace(
              split_part(split_part(btrim(social_url), '#', 1), '?', 1),
              '^https://www[.]',
              'https://',
              'i'
            ),
            '/+$',
            ''
          )) = lower($1)
        LIMIT 1
      `,
      [socialUrl],
    );
    if (duplicateResult.rows.length) {
      await client.query('COMMIT');
      return { duplicate: true, limited: false, review: null };
    }

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`site-review:${ipHash}`],
    );
    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS attempts
        FROM public.site_reviews
        WHERE ip_hash = $1
          AND created_at > NOW() - INTERVAL '${REVIEW_SUBMISSION_WINDOW_HOURS} hours'
      `,
      [ipHash],
    );
    if (Number(countResult.rows[0]?.attempts || 0) >= REVIEW_SUBMISSION_LIMIT) {
      await client.query('COMMIT');
      return { limited: true, review: null };
    }

    const result = await client.query(
      `
        INSERT INTO public.site_reviews
          (name, social_url, rating, review_text, status, source, prompt_id, ip_hash, user_agent)
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
        RETURNING id, name, social_url, rating, review_text, status, source, prompt_id,
          created_at::text AS created_at
      `,
      [name, socialUrl, rating, text, source, promptId, ipHash, userAgent],
    );
    await client.query('COMMIT');
    return { limited: false, review: mapReview(result.rows[0], { includeProfile: true }) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getApprovedSiteReviewData({ page = 1 } = {}) {
  const pool = getPgPool();
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (safePage - 1) * PUBLIC_REVIEW_PAGE_SIZE;
  const [summaryResult, reviewsResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS "approvedCount",
        COALESCE(AVG(rating), 0)::numeric(3, 2)::text AS "averageRating"
      FROM public.site_reviews
      WHERE status = 'approved'
        AND source IN ('website', 'copy-gate')
    `),
    pool.query(
      `
        SELECT id, name, rating, review_text, status, source, prompt_id,
          to_jsonb(site_reviews)->>'profile_image_url' AS profile_image_url,
          to_jsonb(site_reviews)->>'social_url' AS social_url,
          created_at::text AS created_at
        FROM public.site_reviews
        WHERE status = 'approved'
          AND source IN ('website', 'copy-gate')
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2
      `,
      [PUBLIC_REVIEW_PAGE_SIZE, offset],
    ),
  ]);
  const approvedCount = Number(summaryResult.rows[0]?.approvedCount || 0);

  return {
    averageRating: Number(summaryResult.rows[0]?.averageRating || 0),
    approvedCount,
    page: safePage,
    pageSize: PUBLIC_REVIEW_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(approvedCount / PUBLIC_REVIEW_PAGE_SIZE)),
    reviews: reviewsResult.rows.map((row) => mapReview(row, { includeProfile: true })),
  };
}

export async function getAdminSiteReviewData() {
  const pool = getPgPool();
  const [summaryResult, reviewsResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COALESCE(AVG(rating) FILTER (WHERE status = 'approved'), 0)::numeric(3, 2)::text AS "averageRating"
      FROM public.site_reviews
    `),
    pool.query(
      `
        SELECT
          id,
          name,
          to_jsonb(site_reviews)->>'profile_image_url' AS profile_image_url,
          to_jsonb(site_reviews)->>'social_url' AS social_url,
          rating,
          review_text,
          status,
          source,
          prompt_id,
          created_at::text AS created_at,
          user_agent
        FROM public.site_reviews
        WHERE status IN ('pending', 'approved', 'rejected')
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          created_at DESC,
          id DESC
        LIMIT $1
      `,
      [ADMIN_REVIEW_PAGE_SIZE],
    ),
  ]);
  const summary = summaryResult.rows[0] || {};

  return {
    counts: {
      pending: Number(summary.pending || 0),
      approved: Number(summary.approved || 0),
      rejected: Number(summary.rejected || 0),
    },
    averageRating: Number(summary.averageRating || 0),
    reviews: reviewsResult.rows.map((row) => mapReview(row, {
      includeProfile: true,
      includeUserAgent: true,
    })),
  };
}

export async function updateSiteReviewProfile(id, { name, profileImageUrl, socialUrl }) {
  const result = await getPgPool().query(
    `
      UPDATE public.site_reviews
      SET name = $2,
          profile_image_url = $3,
          social_url = $4
      WHERE id = $1
      RETURNING
        id,
        name,
        profile_image_url,
        social_url,
        rating,
        review_text,
        status,
        source,
        prompt_id,
        created_at::text AS created_at
    `,
    [id, name, profileImageUrl, socialUrl],
  );
  return result.rows[0]
    ? mapReview(result.rows[0], { includeProfile: true })
    : null;
}

export async function setSiteReviewStatus(id, status) {
  const result = await getPgPool().query(
    `
      UPDATE public.site_reviews
      SET status = $2
      WHERE id = $1
      RETURNING id, name, rating, review_text, status, source, prompt_id,
        created_at::text AS created_at
    `,
    [id, status],
  );
  return result.rows[0] ? mapReview(result.rows[0]) : null;
}

export async function deleteSiteReview(id) {
  const result = await getPgPool().query(
    `
      DELETE FROM public.site_reviews
      WHERE id = $1
      RETURNING id, status
    `,
    [id],
  );
  return result.rows[0]
    ? { id: Number(result.rows[0].id), status: result.rows[0].status }
    : null;
}
