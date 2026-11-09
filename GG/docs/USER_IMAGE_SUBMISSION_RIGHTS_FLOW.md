# User Image Submission Rights Flow

Reviewed July 26, 2026.

## Current workflows

- Public Contact form: text only; no image attachment field.
- Promptshe trial form: name and WhatsApp number only; no image attachment field.
- Public profile/community upload: none found.
- Authenticated admin prompt editor: accepts JPEG, PNG and WebP files through Vercel Blob.

AQPrompts must not describe an image as “community submitted” because no public image-submission workflow currently supports that claim.

## Safeguards implemented for admin uploads

Before any new primary, gallery or Open Graph image can be uploaded, the authenticated administrator must actively confirm that:

- the uploader owns the image or has documented submission and publication permission;
- identifiable people consented, or no identifiable person appears;
- a minor is not shown in an inappropriate, exploitative, sexualized, deceptive or unsafe context;
- the image is not intended for impersonation, fabricated evidence or misleading identity/status/endorsement claims;
- copyright, trademarks, characters, logos, watermarks and third-party material were reviewed;
- AQPrompts has permission to display the image and handle removal/correction requests.

The checkboxes are not preselected. The server refuses to authorize the upload token if any confirmation is missing.

## Data minimization

The upload flow does not request government identity documents, biometric verification, a home address, or unnecessary sensitive data. The attestation authorizes the upload but is not a substitute for retaining the underlying licence, consent, source and creation evidence.

## Evidence retention

For every accepted image, create or update an internal provenance record containing:

- asset path and page;
- uploader/admin responsible for the record;
- source/creator;
- rights basis and licence;
- identifiable-person and reference-photo permissions;
- creation tool/model/prompt when applicable;
- commercial-publication status;
- evidence-file paths;
- review date.

Do not place private consent records in `public/`, frontend bundles, generated public JSON or public repository documentation.

## Removal requests

Rights, privacy and removal requests are accepted through `/contact` or `hello@aqprompts.com`. The reviewer should preserve the request, identify every affected route/derivative, suppress the asset immediately when risk is credible, and record the final correction/removal decision.

Relevant public pages:

- `/terms`
- `/privacy`
- `/disclaimer`
- `/contact`

