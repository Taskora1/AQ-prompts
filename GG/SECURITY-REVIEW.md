# AQPrompts MCP Connector — Pre-production Security Audit

**Audit date:** 2026-10-15
**Scope:** Read-only audit of the MCP connector in `E:\AQ\GG`, its dependency tree, and the documented Claude connector authentication flow. No files other than this report were changed for the follow-up, no packages were installed or updated, no database writes were made, and nothing was deployed.

## Executive summary

**Recommendation: NO-GO for production until dependency advisories are triaged and remediated, especially the installed Next.js version.** The MCP-specific review found no confirmed exploitable vulnerability. Several high-severity Next.js advisories and three upstream Next.js RCE advisories apply to the installed version range, although the reviewed configuration reduces the apparent reachability of some advisories. Reachability is not a substitute for upgrading and retesting.

`npm audit` reported **51 vulnerable package records**: 1 critical, 13 high, and 37 moderate. `npm audit --omit=dev` still reported **49 records**: 1 critical, 11 high, and 37 moderate. The 51 count is npm's affected-package count, not 51 distinct upstream advisory IDs. The extracted report contained 47 distinct GHSA advisory IDs; some affect multiple installed package records, notably the Tiptap family.

The direct production dependency `@modelcontextprotocol/sdk@1.32.1` and `zod@4.6.7` were not flagged by npm audit. This does not eliminate the separate framework and application dependency risks.

## Prioritized findings

| # | Severity | File | Lines | Finding | Confidence |
|---|----------|------|-------|---------|------------|
| 1 | 🔴 CRITICAL | `package.json`, `package-lock.json` (`next@16.2.6`) | N/A | Installed Next.js is within three reported RCE ranges: Windows-hosted server RCE (`GHSA-p293-qw3h-jr36`, `<16.3.3`), AVIF Image Optimization RCE (`GHSA-2xp9-vwfh-vxw4`, `<16.3.3`), and `next/og` ImageResponse RCE (`GHSA-vcvr-r3jv-pc5j`, `>=16.2.0 <16.3.6`). The Windows issue depends on the host OS; `images.unoptimized: true` appears to disable the standard `/_next/image` handler, and no `ImageResponse` usage was found. Exploitability in this deployment was not established. | 9/10 for affected version; 5/10 for reachability |
| 2 | 🟠 HIGH | `package.json`, `package-lock.json` | N/A | The production audit includes 11 high-severity affected-package records in addition to the critical record. Key families include Next.js SSRF / middleware bypass / DoS, PostCSS source-map file disclosure/path traversal, `sharp` native image-library vulnerabilities, `js-yaml` CPU DoS, and `undici` WebSocket DoS. | 9/10 |
| 3 | 🟡 MEDIUM | `src/lib/mcp-auth.js`, `app/api/mcp/route.js` | N/A | One shared static bearer key authorizes all connector users to list/read Photo and Text drafts and published prompts and create/update drafts. It does not identify individual users; access should be limited to trusted users and the key managed as an organization-wide credential. This matches the static-header model, not an authentication bypass. | 9/10 |
| 4 | ⚪ LOW | Git root `E:\AQ` | N/A | The repository has no commits or tracked baseline. `E:\AQ\GG` and separate backup items are untracked, so a reliable changed-file diff and confirmation that no unrelated files changed are not possible from Git status. | 10/10 |

### Dependency advisory inventory

Installed versions/ranges below come from the npm lockfile/audit and `npm explain` output. Unless noted, the production-only audit still included these affected package records.

| Package family / dependency path | Severity and advisories |
|---|---|
| **Next.js 16.2.6**, direct production dependency; also peer-optional under Vercel analytics packages | **Critical:** `GHSA-p293-qw3h-jr36` (Windows-hosted RCE, `<16.3.3`); `GHSA-2xp9-vwfh-vxw4` (AVIF image-optimization RCE, `<16.3.3`); `GHSA-vcvr-r3jv-pc5j` (`next/og` ImageResponse RCE, `>=16.2.0 <16.3.6`). **High:** `GHSA-6gpp-xcg3-4w24` (Middleware/Proxy bypass); `GHSA-m99w-x7hq-7vfj` (Server Actions DoS); `GHSA-89xv-2m56-2m9x` (Server Actions SSRF on custom servers); `GHSA-p9j2-gv94-2wf4` (rewrite SSRF); `GHSA-cjq9-62q9-8jv4` (Image Optimization SSRF), all in affected `<16.2.11` or `<16.3.8` ranges shown by the advisory. **Moderate:** `GHSA-68g3-v927-f742`, `GHSA-4633-3j49-mh5q` (cache confusion); `GHSA-4c39-4ccg-62r3` (unbounded Edge Server Action payload); `GHSA-q8wf-6r8g-63ch` (SVG image-optimization DoS); `GHSA-955p-x3mx-jcvp` (Server Function endpoint disclosure); `GHSA-4jqv-mc3x-m676` and `GHSA-mcj8-r9mp-w47p` (SSG/ISR cache poisoning); `GHSA-f87g-xv8r-7p7x` (metadata-image disclosure). **Low:** `GHSA-39w2-rjm5-chcv` (development-server MCP endpoint disclosure). The detailed affected ranges are recorded in the linked advisory pages. |
| **PostCSS**, root `8.4.31` and nested under Next `8.5.14`; also present as a dev dependency | **High:** `GHSA-6g55-p6wh-862q` (source-map file disclosure), `GHSA-r28c-9q8g-f849` (source-map path traversal). **Moderate:** `GHSA-qx2v-qp2m-jg93` (CSS stringification XSS), `GHSA-fxqj-rqcc-2cmp` (incomplete source-map disclosure fix). The production audit includes the nested Next dependency. |
| **js-yaml 4.1.1**, root dependency and also used by ESLint tooling | **High:** `GHSA-52cp-r559-cp3m`, `GHSA-5p4m-2wfm-xmqj`, `GHSA-2883-xcg3-v3hh` (quadratic CPU / merge-key or `!!omap` processing). **Moderate:** `GHSA-h67p-54hq-rp68` (merge-key CPU DoS). |
| **sharp 0.34.5**, root dev dependency and optional dependency of production Next | **High:** `GHSA-f88m-g3jw-g9cj` (libvips CVEs); `GHSA-rgj7-g3m4-5g8c` (libheif); `GHSA-wq5f-xc86-pv6w` (librsvg). npm's production-only audit includes its Next optional dependency path. |
| **undici 6.28.0**, transitively through production `@vercel/blob@2.6.1` | **High:** `GHSA-rfgv-xxqx-mfg5` (WebSocket DoS). **Moderate:** `GHSA-3wwx-pv8p-q78v` (WebSocket decompression DoS). **Low:** `GHSA-r53p-7pc4-xj5r` (response splitting via retry interceptor). |
| **Tiptap 2.27.2 family**, production editor packages and their extensions | **Moderate:** `GHSA-cp6q-959q-f8rh` (`mergeAttributes()` prototype-key handling). The same advisory affects many installed `@tiptap/*` package records (including the core, React, StarterKit, and extensions); these repeated entries account for much of npm's record count. |
| **postcss-selector-parser** | **Moderate:** `GHSA-rj75-hqrm-r3gf` (selector parsing CPU complexity). **Low:** `GHSA-w9m9-85wc-3x92` (AST recursion DoS). |
| **brace-expansion** (development-only difference) | **High:** `GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`, `GHSA-rgw5-rvv9-x895`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p` (CPU, memory, or stack exhaustion). **Moderate:** `GHSA-q2hr-2g5m-vwhr` (quadratic CPU). |
| **browserslist** (development-only difference) | **High:** `GHSA-c83g-rgw3-j3cx` (memory exhaustion) and `GHSA-73wf-gq98-2v4g` (crash/prototype write from custom stats). |
| **braces** | **High:** `GHSA-vfj7-8cjw-p6xm` (stack exhaustion). |
| **nanoid** | **High:** `GHSA-28wg-ghj8-5hjv` and `GHSA-2v37-7h3g-55p8` (generator loops for invalid sizes). |
| **source-map-js** | **High:** `GHSA-68fv-2mgg-jv7q` (event-loop DoS). |
| **baseline-browser-mapping** | **Moderate:** `GHSA-w5vr-8v7q-w6rv` (process termination on invalid input). |
| **chokidar, fast-glob, micromatch** | Marked affected through inherited/transitive audit paths; no additional distinct advisory IDs beyond the families above. |

The audit ranges, titles, and severities are linked in the upstream advisory references listed in the table. Exact `npm audit` affected-package counts differ from the number of distinct GHSA IDs because a single advisory can apply to multiple installed package records.

## MCP connector review

| Area | Result |
|---|---|
| Authentication | `AQ_MCP_API_KEY` is separate from admin-session credentials. The endpoint fails closed when it is missing or shorter than 32 characters (503) and returns 401 for missing/invalid Bearer authorization. The key is hashed before `crypto.timingSafeEqual`, so equal-length digest comparison avoids direct variable-length timing comparison. No credentials are emitted in logs or responses. |
| Transport / request size | Stateless Streamable HTTP, Node runtime, JSON responses, 64 KiB MCP transport request-body limit. No server-side session state is relied upon. |
| Host validation | The SDK transport has an explicit allowed-host list for the production hostname, aliases, local development hosts, and a validated `VERCEL_URL` when present. No wildcard host was identified. No unverified Claude `Origin` allowlist is assumed. |
| Tool authorization | Strict schemas and bounded input values; only list, get, list-categories, create-draft, and update-draft are registered. No publish or delete tool. Results use explicit fields. Queries are parameterized and scoped by `library_type`. |
| Draft enforcement | Creation constructs the database input with status forced to `draft`. Update rejects non-drafts before validation and sends a conditional `status = 'draft'` predicate to the database helper within its transaction, preventing a concurrent publish from being overwritten. Tests cover Photo and Text status guards. |
| Image URLs | Tool inputs are URL-validated and then checked by the existing Photo validator, which only accepts HTTPS Cloudinary image-upload URLs or Vercel Blob public URLs. The MCP implementation stores the URL and does not fetch it server-side; the reviewed path therefore does not provide a URL-fetch primitive for internal-service SSRF. This does not prove ownership of a remote public image or validate its visual/content safety. |
| Error handling / logging | Tool errors return safe messages; unexpected failures log a generic MCP error without raw exception, prompt, request body, or authorization header. Endpoint protocol errors are not converted into success-shaped results. |
| Authorization model | A valid connector key has broad service-level access to both libraries and all statuses for reading, and draft mutations. Static headers are organization-shared, not per-person authorization or attribution. Protect and rotate the key; do not share it outside the intended operators. |

## Claude Custom Connector compatibility

Current official Anthropic documentation says `static_headers` permits an organization Owner to enter a static API key or bearer token, which Claude sends in a request header. Standard `authorization` headers are supported. **This feature is beta and available only to a limited set of organizations; organizations without access do not see the Request headers section.** Therefore, the server mechanism is compatible where that feature is available, but this account's UI compatibility is not confirmed. No live Claude connection was tested.

- [Anthropic connector authentication](https://claude.com/docs/connectors/building/authentication)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)

## Checks and repository scope

- `npm audit --json`: **51 records** (37 moderate, 13 high, 1 critical), non-zero exit due to advisories.
- `npm audit --omit=dev`: **49 records** (37 moderate, 11 high, 1 critical), non-zero exit. `brace-expansion` and `browserslist` were the two records removed from this production-only result.
- `node --test tests/mcp-endpoint.test.js`: **6 passed, 0 failed**, with database calls mocked. No database writes.
- The security review also checked the existing Photo and Text database helper scopes, route behaviors, and URL validator. No migrations or production credentials were used.
- No full build was run. The project build lifecycle runs prebuild/content-generation and thumbnail-generation scripts; running it here could write generated files or contact configured resources. A safe build validation should use a disposable worktree/copy, a synthetic isolated database, synthetic-only environment configuration, and a before/after file diff to confirm that all generated changes remain inside the disposable copy. Never load production credentials into that build.
- No files were installed or updated and no deployment was performed.

The Git root (`E:\AQ`) has no commits, and `E:\AQ\GG` is wholly untracked. Git therefore cannot distinguish prior connector work, other pre-existing workspace files, and later changes. The connector-related paths identified from this task are:

- `GG/app/api/mcp/route.js`
- `GG/src/lib/mcp-auth.js`
- `GG/src/lib/mcp-prompt-tools.js`
- `GG/src/lib/mcp-server.js`
- `GG/src/lib/prompts-admin-db.js`
- `GG/src/lib/text-prompts-admin-db.js`
- `GG/tests/mcp-endpoint.test.js`
- `GG/package.json`
- `GG/package-lock.json`
- `GG/.env.example`

This report is the only file intentionally added and committed for the follow-up. No application or dependency changes were made by the audit.
