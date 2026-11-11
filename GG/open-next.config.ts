import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

// Real KV-backed caches (not the default "dummy" cache, which caches nothing).
// Without these, every ISR/static page re-renders on every request and blows
// the Workers Free 10 ms CPU limit (Error 1102).
// KV namespaces (free tier) — bindings are declared in wrangler.jsonc:
//   NEXT_INC_CACHE_KV  -> aqprompts-inc-cache
//   NEXT_TAG_CACHE_KV  -> aqprompts-tag-cache
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvNextTagCache,
});
