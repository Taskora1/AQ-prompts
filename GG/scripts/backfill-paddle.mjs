let getPgPool;

async function main() {
  const [{ getPaddleServerClient }, paddleStore] = await Promise.all([
    import('../src/lib/paddle/server.js'),
    import('../src/lib/db.js'),
  ]);
  const { ensurePaddleSchema, upsertCustomer, upsertSubscription } = paddleStore;
  getPgPool = paddleStore.getPgPool;

  await ensurePaddleSchema();

  const paddle = getPaddleServerClient();
  let customerCount = 0;
  let subscriptionCount = 0;

  for await (const customer of paddle.customers.list()) {
    await upsertCustomer(customer);
    customerCount += 1;
  }

  for await (const subscription of paddle.subscriptions.list()) {
    await upsertSubscription(subscription);
    subscriptionCount += 1;
  }

  console.log(`Paddle backfill complete: ${customerCount} customers, ${subscriptionCount} subscriptions.`);
}

main()
  .catch(() => {
    console.error('Paddle backfill failed. Check API key environment, permissions, and DATABASE_URL.');
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration failed before initialization.
    }
  });
