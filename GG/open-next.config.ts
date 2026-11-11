import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

// Incremental cache is R2-backed (not KV): KV free tier allows only 1,000
// writes/day and each deploy re-inserts the whole cache (~676 writes), which
// blocked deploys on 2026-11-11. R2 free tier has no daily write cap
// (1M Class A writes/month) so deploys are no longer blocked.
// Tag cache stays KV (tiny usage, no daily-cap problem).
// R2 bucket binding is declared in wrangler.jsonc:
//   NEXT_INC_CACHE_R2_BUCKET -> aqprompts-inc-cache
// KV namespaces below are kept so a rollback is a one-line change here.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: kvNextTagCache,
});
