# AQPrompts Image Asset Classification Policy

Effective review date: July 26, 2026.

The AQPrompts website owner has declared that portrait, article, prompt-card, homepage, and demonstration images are either fully AI-generated or AI-edited from owner-provided or permitted reference photographs. The declaration is recorded at `content/provenance/OWNER_MEDIA_DECLARATION.json`.

This project-level declaration is the current source classification. It does not supply individual tool names, model versions, prompts, generation dates, settings, or licences, and those fields remain unknown where no record exists. Missing embedded metadata alone is not a reason to remove an otherwise safe owner-declared image.

| Group | Classification | Current evidence basis | Public disclosure | Removal/replacement rule |
|---|---|---|---|---|
| A | First-party brand assets | Repository source or asset-specific record | None unless context requires it | Replace only when a specific rights or misuse risk exists |
| B | Founder/author photographs | Real photograph plus owner-confirmed site display | No AI label | Keep as real; retain an individual photographer/source record when available |
| C | AI-generated demonstration images | Owner media declaration; individual generation fields recorded when available | “AI-generated example image for demonstration purposes.” | Retain unless a specific high-risk condition applies |
| D | AI-edited demonstration images | Owner media declaration; reference ownership/permission is `owner-confirmed` at project level | “AI-edited example image for demonstration purposes.” | Retain unless the reference is unapproved or another specific high-risk condition applies |
| E | Third-party logos/platform marks | Official source and nominative-use context | Non-affiliation wording where confusion is possible | Remove if decorative, endorsement-like, or clearly misused |
| F | Screenshots/interface images | Capturer, date/version where known, redaction and platform review | Identify as a screenshot when relevant | Remove unsafe personal data or deceptive/outdated use |
| G | Decorative graphics | Repository/creator record where available | None; empty alt when genuinely decorative | Replace only if a specific source problem exists |
| H | Unknown/out-of-scope assets | Manual classification required | Do not make unsupported claims | Quarantine until classified |

## High-risk priority rule

Public rendering must suppress or replace an image when a specific signal involves:

1. A public figure or impersonation context.
2. A copyrighted character or protected entertainment property.
3. An unapproved third-party reference photograph.
4. An explicit or ambiguous minor.
5. A visible watermark.
6. Clear trademark misuse or false endorsement.

Ordinary AI-generated and AI-edited examples are not high risk solely because their original generation metadata was not retained.

## Internal and public information

The public page displays only the appropriate demonstration disclosure. Internal provenance notes, risk reasoning, hashes, licence-review notes, and evidence locations stay in the internal register and are not rendered as public captions.

## Restoration

Before restoring a specifically suppressed asset, clear the triggering risk, record the decision in the provenance register, verify any reference-image permission or subject consent, and re-run the Phase 4 audits.
