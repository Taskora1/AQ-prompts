/**
 * Blog Deploy Hook
 *
 * After a successful blog mutation (create, edit, delete), this module
 * triggers a Vercel Deploy Hook to rebuild the site so that the
 * generated blog content becomes publicly available.
 *
 * Environment variable required:
 *   VERCEL_DEPLOY_HOOK_URL — The Vercel Deploy Hook URL.
 *   This is a Vercel-specific webhook that triggers a new deployment.
 *   Create it in: Vercel Dashboard → Project → Settings → Git → Deploy Hooks
 *
 * The secret is NEVER exposed to the client. It is only used server-side.
 */

const DEPLOY_HOOK_URL = process.env.VERCEL_DEPLOY_HOOK_URL || '';

// Deduplication: prevent triggering more than once per 30 seconds.
// This avoids duplicate builds when admin saves multiple times quickly.
const DEDUP_WINDOW_MS = 30_000;
let lastTriggerAt = 0;

/**
 * Triggers a Vercel deploy hook after a successful blog mutation.
 * Safe to call even if the env var is missing — it will silently skip.
 *
 * @param {string} action — The mutation type (e.g. 'create', 'update', 'delete')
 * @param {string} slug — The post slug that was mutated
 */
export async function triggerBlogRebuild(action, slug) {
  if (!DEPLOY_HOOK_URL) {
    console.log(
      `[blog-deploy-hook] VERCEL_DEPLOY_HOOK_URL is not set. Skipping rebuild trigger for ${action}: ${slug}.`,
    );
    return;
  }

  const now = Date.now();
  if (now - lastTriggerAt < DEDUP_WINDOW_MS) {
    console.log(
      `[blog-deploy-hook] Dedup window active (${DEDUP_WINDOW_MS}ms). Skipping rebuild trigger for ${action}: ${slug}.`,
    );
    return;
  }

  lastTriggerAt = now;

  try {
    console.log(
      `[blog-deploy-hook] Triggering rebuild for ${action}: ${slug}`,
    );

    const response = await fetch(DEPLOY_HOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        slug,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(
        `[blog-deploy-hook] Deploy hook returned HTTP ${response.status}: ${text.slice(0, 200)}`,
      );
      return;
    }

    console.log(
      `[blog-deploy-hook] Rebuild triggered successfully for ${action}: ${slug}`,
    );
  } catch (error) {
    // Deploy hook failures should never block the admin operation.
    // The MDX file is already saved; the admin can retry or manually deploy.
    console.error(
      `[blog-deploy-hook] Failed to trigger rebuild for ${action}: ${slug}`,
      error?.message || error,
    );
  }
}
