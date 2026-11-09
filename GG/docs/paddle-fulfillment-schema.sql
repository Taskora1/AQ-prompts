-- Paddle fulfillment tables. Run this once in your Postgres database.
-- These rows are live fulfillment state. Do not delete them as cleanup.

CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  status TEXT NOT NULL,
  price_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  scheduled_change_action TEXT,
  scheduled_change_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
