// Prompt engagement — views, likes and per-prompt feedback.
//
// Design (cheap on D1, by owner decision 2026-11-16):
// - view_count / like_count live ON the prompts row, so listing and detail
//   queries return them with zero extra reads. A view or like is a single
//   UPDATE (1 write). No per-card stats query, no separate stats table.
// - Feedback is stored in the existing public.site_reviews table with
//   source = 'prompt', name = 'Anonymous' and status = 'pending', so it
//   goes through the same pending-review moderation queue as normal
//   reviews: it only shows on the /feedback listing and in the detail-page
//   average + count after an admin approves it (setSiteReviewStatus in
//   site-reviews-db.js; the admin reviews panel lists pending first).
//   The detail-page average + count reads the same rows by prompt_id,
//   approved only.
// - Prompt feedback is anonymous (no login, no name, no social link) and
//   the comment is optional. It does NOT appear anywhere until approved —
//   the admin reviews panel can approve, reject or delete spam afterwards.
// - Spam control for feedback mirrors submitSiteReview: at most 5
//   submissions per IP hash per hour, folded into the INSERT itself so the
//   decision is atomic. Views and likes have no server-side rate limit:
//   views count EVERY visit by owner rule, likes are guarded once-per-
//   browser in the client (localStorage); the D1 write budget (100k/day)
//   and the Workers request budget bound any abuse, and the KV write
//   budget (1,000/day, already ~50% used by the Next.js incremental
//   cache) is deliberately NOT spent on engagement actions.
//
// All SQL is Postgres dialect; the D1 translator (pg-to-d1.js) rewrites it
// for SQLite. Columns are added lazily (same pattern as
// ensureUsersDisplayNameColumn): the migration script
// scripts/add-prompt-engagement.mjs carries the same ALTERs for the Neon
// backup schema, and the live D1 columns appear on the first engagement
// request after deploy.
import { getPgPool } from './db.js';

export const ADD_PROMPT_VIEW_COUNT_COLUMN_SQL = `
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0
`;

export const ADD_PROMPT_LIKE_COUNT_COLUMN_SQL = `
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0
`;

export const PROMPT_FEEDBACK_SOURCE = 'prompt';
export const PROMPT_FEEDBACK_DISPLAY_NAME = 'Anonymous';
export const MAX_FEEDBACK_COMMENT_LENGTH = 500;
export const PROMPT_FEEDBACK_RATE_LIMIT = 5;
export const PROMPT_FEEDBACK_RATE_WINDOW_HOURS = 1;

let promptEngagementSchemaPromise;

async function addColumnIfMissing(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (/duplicate column name/i.test(String(error?.message || ''))) return;
    throw error;
  }
}

export async function ensurePromptEngagementSchema() {
  if (!promptEngagementSchemaPromise) {
    promptEngagementSchemaPromise = (async () => {
      const pool = getPgPool();
      await addColumnIfMissing(pool, ADD_PROMPT_VIEW_COUNT_COLUMN_SQL);
      await addColumnIfMissing(pool, ADD_PROMPT_LIKE_COUNT_COLUMN_SQL);
    })().catch((error) => {
      promptEngagementSchemaPromise = undefined;
      throw error;
    });
  }
  await promptEngagementSchemaPromise;
}

export class PromptEngagementValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptEngagementValidationError';
  }
}

export function normalizePromptEngagementId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new PromptEngagementValidationError('A valid prompt id is required.');
  }
  return id;
}

// Rating is required (1-5 stars); the comment is optional.
export function validatePromptFeedbackInput({ rating, comment } = {}) {
  const parsedRating = Number(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new PromptEngagementValidationError('Choose a rating from 1 to 5 stars.');
  }
  const text = String(comment ?? '').trim();
  if (text.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    throw new PromptEngagementValidationError(
      `Feedback must be ${MAX_FEEDBACK_COMMENT_LENGTH} characters or fewer.`,
    );
  }
  return { rating: parsedRating, comment: text };
}

export async function incrementPromptViewCount(promptId) {
  const id = normalizePromptEngagementId(promptId);
  await ensurePromptEngagementSchema();
  const result = await getPgPool().query(
    `
      UPDATE prompts
      SET view_count = view_count + 1
      WHERE id = $1
        AND status = 'published'
      RETURNING view_count AS "viewCount"
    `,
    [id],
  );
  const row = result.rows[0];
  return row ? Number(row.viewCount) : null;
}

export async function incrementPromptLikeCount(promptId) {
  const id = normalizePromptEngagementId(promptId);
  await ensurePromptEngagementSchema();
  const result = await getPgPool().query(
    `
      UPDATE prompts
      SET like_count = like_count + 1
      WHERE id = $1
        AND status = 'published'
      RETURNING like_count AS "likeCount"
    `,
    [id],
  );
  const row = result.rows[0];
  return row ? Number(row.likeCount) : null;
}

export async function submitPromptFeedback({
  promptId,
  rating,
  comment = '',
  ipHash,
  userAgent = '',
}) {
  const id = normalizePromptEngagementId(promptId);
  const { rating: parsedRating, comment: text } = validatePromptFeedbackInput({ rating, comment });
  if (typeof ipHash !== 'string' || !ipHash) {
    throw new PromptEngagementValidationError('Feedback could not be verified. Please reload and try again.');
  }

  // The per-IP rate-limit check is folded into the INSERT itself, so the
  // whole submission is one atomic statement (same pattern as
  // submitSiteReview in site-reviews-db.js).
  const result = await getPgPool().query(
    `
      INSERT INTO public.site_reviews
        (name, social_url, rating, review_text, status, source, prompt_id, ip_hash, user_agent)
      SELECT $1, $2, $3, $4, 'pending', 'prompt', $5, $6, $7
      WHERE (
        SELECT COUNT(*)::int
        FROM public.site_reviews
        WHERE ip_hash = $6
          AND created_at > NOW() - INTERVAL '${PROMPT_FEEDBACK_RATE_WINDOW_HOURS} hours'
      ) < $8
      RETURNING id, name, social_url, rating, review_text, status, source, prompt_id,
        created_at::text AS created_at
    `,
    [
      PROMPT_FEEDBACK_DISPLAY_NAME,
      '',
      parsedRating,
      text,
      id,
      ipHash,
      String(userAgent || '').slice(0, 500),
      PROMPT_FEEDBACK_RATE_LIMIT,
    ],
  );

  if (result.rows[0]) {
    return { limited: false, review: result.rows[0] };
  }
  return { limited: true, review: null };
}

export async function getPromptFeedbackSummary(promptId) {
  const id = normalizePromptEngagementId(promptId);
  const result = await getPgPool().query(
    `
      SELECT
        COUNT(*)::int AS "reviewCount",
        COALESCE(AVG(rating), 0)::numeric(3, 2)::text AS "averageRating"
      FROM public.site_reviews
      WHERE prompt_id = $1
        AND status = 'approved'
        AND source = 'prompt'
    `,
    [id],
  );
  const row = result.rows[0] || {};
  return {
    reviewCount: Number(row.reviewCount || 0),
    averageRating: Number(row.averageRating || 0),
  };
}
