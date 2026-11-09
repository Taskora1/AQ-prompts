# Paddle Fulfillment Setup

This project now has a server-side Paddle fulfillment layer:

- Webhook endpoint: `/api/paddle/webhook`
- Account billing page: `/account`
- Customer portal POST endpoint: `/account/portal`

## Required environment variables

```env
DATABASE_URL=postgres://user:password@host:5432/database
PADDLE_ENVIRONMENT=production
PADDLE_API_KEY=pdl_live_...
PADDLE_WEBHOOK_SIGNING_SECRET=ntfsec_...
```

`PADDLE_API_KEY` is for server API calls. `PADDLE_WEBHOOK_SIGNING_SECRET` is the notification signing secret. They are different values.

## Database

Run `docs/paddle-fulfillment-schema.sql` once in your Postgres database. The app also creates the tables with `CREATE TABLE IF NOT EXISTS` when webhook/account routes run, but running the SQL directly makes the schema explicit.

## Paddle notification destination

The `paddle-live` MCP was not available in this workspace. Create the live notification destination manually:

1. Go to Paddle > Developer tools > Notifications.
2. Create a URL notification destination.
3. URL: `https://YOUR_APPROVED_DOMAIN.com/api/paddle/webhook`.
4. Subscribe to these events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
   - `customer.created`
   - `customer.updated`
   - `transaction.completed`
5. Copy the notification signing secret into `PADDLE_WEBHOOK_SIGNING_SECRET`.

Do not delete the notification destination, signing secret, products, prices, customers, subscriptions, transactions, or mirrored DB rows as cleanup. They are fulfillment infrastructure and live state.

## Auth integration

`src/lib/auth.js` is a server-side placeholder. Replace `getSignedInUser()` with your real auth provider and return at least `{ email }`. The portal route never accepts customer IDs from the client; it resolves the Paddle customer from the signed-in email server-side.
