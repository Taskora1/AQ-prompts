import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT;
const expectedConfirmation = PADDLE_ENVIRONMENT === 'production'
  ? 'CREATE_PRODUCTION_CATALOG'
  : 'CREATE_SANDBOX_CATALOG';
const PADDLE_API_BASE = process.env.PADDLE_API_BASE || (
  PADDLE_ENVIRONMENT === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
);

if (!PADDLE_API_KEY || !['sandbox', 'production'].includes(PADDLE_ENVIRONMENT)) {
  console.error('Set PADDLE_API_KEY and PADDLE_ENVIRONMENT=sandbox|production before creating a catalog.');
  process.exit(1);
}

if (process.env.PADDLE_CATALOG_CONFIRM !== expectedConfirmation) {
  console.error(`Refusing to create duplicate-prone catalog records. Set PADDLE_CATALOG_CONFIRM=${expectedConfirmation} to continue.`);
  process.exit(1);
}

if (PADDLE_ENVIRONMENT === 'sandbox' && !PADDLE_API_KEY.startsWith('pdl_sdbx_apikey_')) {
  console.error('The Paddle API key does not match the sandbox environment.');
  process.exit(1);
}

if (PADDLE_ENVIRONMENT === 'production' && !PADDLE_API_KEY.startsWith('pdl_live_apikey_')) {
  console.error('The Paddle API key does not match the production environment.');
  process.exit(1);
}

const catalog = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Starter membership for AI prompt access and creator resources.',
    prices: [
      {
        key: 'starter_monthly',
        name: 'Starter Monthly',
        description: 'Starter monthly recurring subscription',
        amount: '500',
        interval: 'month',
        overrides: [
          { country_codes: ['GB'], unit_price: { amount: '400', currency_code: 'GBP' } },
          { country_codes: ['IE'], unit_price: { amount: '450', currency_code: 'EUR' } },
          { country_codes: ['AU'], unit_price: { amount: '750', currency_code: 'AUD' } },
        ],
      },
      {
        key: 'starter_annual',
        name: 'Starter Annual',
        description: 'Starter annual recurring subscription',
        amount: '5000',
        interval: 'year',
        overrides: [
          { country_codes: ['GB'], unit_price: { amount: '4000', currency_code: 'GBP' } },
          { country_codes: ['IE'], unit_price: { amount: '4500', currency_code: 'EUR' } },
          { country_codes: ['AU'], unit_price: { amount: '7500', currency_code: 'AUD' } },
        ],
      },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Pro membership for advanced AI prompt access and creator workflows.',
    prices: [
      {
        key: 'pro_monthly',
        name: 'Pro Monthly',
        description: 'Pro monthly recurring subscription',
        amount: '1000',
        interval: 'month',
        overrides: [
          { country_codes: ['GB'], unit_price: { amount: '800', currency_code: 'GBP' } },
          { country_codes: ['IE'], unit_price: { amount: '900', currency_code: 'EUR' } },
          { country_codes: ['AU'], unit_price: { amount: '1500', currency_code: 'AUD' } },
        ],
      },
      {
        key: 'pro_annual',
        name: 'Pro Annual',
        description: 'Pro annual recurring subscription',
        amount: '10000',
        interval: 'year',
        overrides: [
          { country_codes: ['GB'], unit_price: { amount: '8000', currency_code: 'GBP' } },
          { country_codes: ['IE'], unit_price: { amount: '9000', currency_code: 'EUR' } },
          { country_codes: ['AU'], unit_price: { amount: '15000', currency_code: 'AUD' } },
        ],
      },
    ],
  },
];

async function paddleRequest(path, body) {
  const response = await fetch(`${PADDLE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Paddle ${path} failed with ${response.status}`);
  }

  return payload.data;
}

async function main() {
  const mapping = [];

  for (const plan of catalog) {
    const product = await paddleRequest('/products', {
      name: plan.name,
      description: plan.description,
      tax_category: 'digital-goods',
      type: 'standard',
      custom_data: { plan_key: plan.key },
    });

    const priceRows = [];

    for (const price of plan.prices) {
      const createdPrice = await paddleRequest('/prices', {
        product_id: product.id,
        name: price.name,
        description: price.description,
        unit_price: {
          amount: price.amount,
          currency_code: 'USD',
        },
        unit_price_overrides: price.overrides,
        billing_cycle: {
          interval: price.interval,
          frequency: 1,
        },
        tax_mode: 'account_setting',
        custom_data: { plan_key: plan.key, price_key: price.key },
      });

      priceRows.push({
        key: price.key,
        id: createdPrice.id,
        name: createdPrice.name,
        billing_cycle: createdPrice.billing_cycle,
        unit_price: createdPrice.unit_price,
        unit_price_overrides: createdPrice.unit_price_overrides,
      });
    }

    mapping.push({
      key: plan.key,
      product_id: product.id,
      product_name: product.name,
      prices: priceRows,
    });
  }

  console.log(JSON.stringify(mapping, null, 2));
}

main().catch(() => {
  console.error('Paddle catalog creation failed.');
  process.exit(1);
});
