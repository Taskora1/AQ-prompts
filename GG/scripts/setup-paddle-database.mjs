let getPgPool;

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  const { ensurePaddleSchema } = paddleStore;
  getPgPool = paddleStore.getPgPool;

  await ensurePaddleSchema();
  const { ensureAuthSchema } = await import('../src/lib/auth-store.js');
  await ensureAuthSchema();
  console.log('Paddle and account database schemas are ready.');
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Paddle database schema setup failed (${errorCode}). Check DATABASE_URL and database permissions.`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration failed before initialization.
    }
  });
