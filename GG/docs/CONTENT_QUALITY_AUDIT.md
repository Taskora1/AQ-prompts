# AQPrompts Content Quality Audit

Internal editorial audit completed July 26, 2026. Word counts are approximate editorial words and exclude fenced prompt blocks and image markup. This document is not intended as a public scoring page.

## Published article inventory

| Page title | URL | Type | Editorial words | Primary intent / topic | Overlap | Author | Published / updated | Prompts | Explanatory H2 sections | Troubleshooting | Ethical guidance | Real testing evidence | Original images | Decision |
|---|---|---:|---:|---|---|---|---|---:|---:|---|---|---|---|---|
| 6 Free Consistent Face AI Portrait Prompts for Adult Women (2026) | `/blog/consistent-face-ai-portrait-prompts-women-girls-2026` | Guide + prompts | 1,700 | Reduce identity drift across adult-woman portrait poses | Overlaps other women's fashion guides, but intent is identity continuity | Abdul Qudoos | 2026-06-07 / 2026-07-26 | 6 | 13 | Yes | Yes | No retained generation record | Six locally stored AI examples; provenance log missing | Keep; retain distinct identity-consistency intent |
| 5 Fashion Prompts for Elegant Portraits of Adult Women | `/blog/elegant-female-ai-portrait-prompts` | Guide + prompts | 1,179 | Indoor pose and composition ideas for adult women | Moderate overlap with the seven-prompt women's fashion guide | Abdul Qudoos | 2026-06-04 / 2026-07-26 | 5 | 10 | Yes | Yes | No retained generation record | Five locally stored AI examples; provenance log missing | Keep now; consider merge if future content remains substantially similar |
| 8 Free AI Fashion Photo Prompts for Instagram 2026 | `/blog/free-ai-fashion-photo-prompts-instagram-2026` | Guide + prompts | 1,501 | Destination-led travel-fashion concepts | Overlaps travel guide, but retains landmark/destination intent | Abdul Qudoos | 2026-06-05 / 2026-07-26 | 8 | 13 | Yes | Yes | No retained generation record | Eight locally stored AI examples; provenance log missing | Keep; continue removing unsupported geographic/product claims |
| 7 Luxury AI Fashion Photography Prompts for Women (2026) | `/blog/luxury-ai-fashion-photography-prompts-for-women` | Guide + prompts | 1,313 | Outdoor/editorial fashion scenes for adult women | Moderate overlap with elegant female portrait guide | Abdul Qudoos | 2026-06-03 / 2026-07-26 | 7 | 10 | Yes | Yes | No retained generation record | Seven locally stored AI examples; provenance log missing | Keep; future consolidation candidate with elegant portrait guide |
| 6 Business Portrait Prompts for Adult Men | `/blog/luxury-businessman-ai-portrait-prompts` | Guide + prompts | 1,387 | Credible business and personal-brand portrait concepts | Distinct business intent | Abdul Qudoos | 2026-06-01 / 2026-07-26 | 6 | 14 | Yes | Yes | No retained generation record | Six locally stored AI examples; provenance log missing | Keep; fully rewritten |
| 5 Fashion AI Portrait Prompts for Adult Men and Women | `/blog/luxury-mens-fashion-ai-portrait-prompts` | Guide + prompts | 1,421 | Retail, cafe, and fashion portrait concepts for adults | Some overlap with women's guides; mixed-adult scope is distinct | Abdul Qudoos | 2026-06-01 / 2026-07-26 | 5 | 13 | Yes | Yes | No retained generation record | Five locally stored AI examples; provenance log missing | Keep; fully rewritten |
| 6 Travel AI Portrait Prompts for Adult Men and Women | `/blog/luxury-travel-ai-portrait-prompts` | Guide + prompts | 1,414 | Generic travel-scene portraits and truthful travel disclosure | Overlaps destination-led Instagram guide but avoids named-location focus | Abdul Qudoos | 2026-06-02 / 2026-07-26 | 6 | 14 | Yes | Yes | No retained generation record | Six locally stored AI examples; provenance log missing | Keep; fully rewritten |

## Other public editorial surfaces

| Page / group | URL(s) | Search intent | Current author/date | Depth and duplication finding | Recommendation |
|---|---|---|---|---|---|
| Homepage | `/` | Discover free prompt library and optional memberships | Organization page; dynamic counts | Clear purpose, but marketing wording required qualification around compatibility and outcomes | Keep; continue using dynamic counts and qualified claims |
| About | `/about` | Understand ownership, purpose, audience, and site model | Abdul Qudoos visible; no artificial founding date | Founder photograph and real name provide trust. Unsupported “perfect prompt” and fixed publishing-frequency wording was removed or qualified | Keep |
| Author profile | `/author/abdul-qudoos` | Verify named author and editorial responsibility | Abdul Qudoos; live article list | Uses only existing founder identity, photograph, contact, and configured social links | Keep |
| Editorial Policy | `/editorial-policy` | Understand selection, AI assistance, corrections, provenance, and independence | Abdul Qudoos; updated 2026-07-26 | Distinct governance content | Keep |
| Review methodology | `/how-we-review-prompts` | Understand editorial review versus generation testing | Abdul Qudoos | Explicitly separates review from testing and explains duplicate/safety checks | Keep |
| Category pages | `/tools/ai-image-prompts`, `/boys`, `/girls`, `/couples`, `/celebrations`, `/business`, `/lifestyle`, `/cinematic`, `/photo-editing` | Browse prompts by use case | Organization pages; dynamic prompt records | Useful hubs with unique category metadata. Public “Girls” label changed to “Women” while legacy route remains for link stability | Keep; consider a future `/women` redirect/canonical migration only with a controlled URL plan |
| Prompt-detail pages | 178 routes under `/tools/ai-image-prompts/p/` | Copy and customize one specific prompt | No personal byline; prompt record dates where available | Every record has title, prompt, image, intro, use case, and editorial fields, but many descriptions are formulaic and lack retained testing/provenance evidence | Index 138 lower-risk records; noindex 40 sensitive/protected/minor-risk records pending manual rewrite |

## Similarity findings

- Exact repeated editorial paragraphs across the seven current MDX sources after cleanup: **0**.
- The original three priority articles shared the same “luxury location + camera terms + professional result” structure and near-identical conclusions. They now use different purposes:
  - fashion: garment coherence, hand/accessory problems, retail settings;
  - business: credibility, invented status, offices, vehicles, and professional misrepresentation;
  - travel: geographic accuracy, weather, safety, and truthful travel disclosure.
- Generic fallback FAQs were being repeated across prompt-detail pages. Those fallbacks and their FAQ schema were removed; only genuine prompt-specific FAQ records now render.
- The remaining largest overlap is between the two adult-women fashion articles. They are kept because one is indoor/pose-led and the other outdoor/editorial-led, but they are the first merge candidates if future revisions cannot deepen that distinction.

## Evidence finding

Local example images exist, but the repository does not contain a reliable tool/model/date/seed/settings/output log proving generation testing for the article prompts. Public copy therefore uses “reviewed,” “starting point,” and “results vary,” not “tested,” “proven,” or tool-performance rankings.

## Final editorial decisions

- **Keep:** homepage, About, author profile, policy/methodology pages, all seven articles, all category hubs, 138 lower-risk prompt pages.
- **Rewrite before reindexing:** 40 prompt pages identified in `PROMPT_PAGE_INDEXING_REVIEW.md`.
- **Merge candidate:** `elegant-female-ai-portrait-prompts` into `luxury-ai-fashion-photography-prompts-for-women` only if their future examples and troubleshooting cannot remain distinct.
- **Remove:** none automatically. Removal requires a record-specific editorial decision or rights/safety complaint.
