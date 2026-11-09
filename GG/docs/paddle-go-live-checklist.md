# Paddle go-live checklist

Use this checklist in the live Paddle dashboard and the Vercel production environment. Never paste credential values into this file or commit them to Git.

## Live environment variables

- `NEXT_PUBLIC_PADDLE_ENVIRONMENT=production`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` — live browser-safe client token
- Four unique live price IDs for Starter monthly/yearly and Pro monthly/yearly
- `PADDLE_ENVIRONMENT=production`
- `PADDLE_API_KEY` — live server API key
- `PADDLE_WEBHOOK_SIGNING_SECRET` — secret for the live notification destination
- `DATABASE_URL` — Neon production connection string
- `RESEND_API_KEY` — server-only key for passwordless account links
- `AUTH_SECRET` — a random value with at least 32 characters; server-only
- `SITE_URL=https://www.aqprompts.com`

After changing Vercel variables, redeploy Production so the build receives the public Paddle values.

## Server API key permissions

Grant only the permissions used by the app:

- Customer portal sessions: Write
- Customers: Read
- Subscriptions: Read
- Prices: Read (catalog validation and diagnostics)
- Products: Read (catalog validation and diagnostics)
- Transactions: Read (backfill and support diagnostics)

No client-side environment variable may contain this server API key.

## Notification destination

- URL: `https://www.aqprompts.com/api/paddle/webhook`
- Events:
  - `customer.created`
  - `customer.updated`
  - `subscription.created`
  - `subscription.updated`
  - `subscription.canceled`
  - `transaction.completed`
- Copy the destination's signing secret to `PADDLE_WEBHOOK_SIGNING_SECRET` in Vercel.
- Use Paddle's simulation tool and confirm a `200` delivery before accepting live payments.

## Checkout and review

- Approved checkout domain: `www.aqprompts.com`
- Default payment link: `https://www.aqprompts.com/pricing`
- Pricing page, Terms, Privacy Policy, and Refund Policy must remain publicly accessible.
- Complete one sandbox successful payment, one declined payment, and one cancellation scenario before the first live charge.
- After production approval, make one low-value live purchase and refund it through Paddle to verify the full customer journey.
