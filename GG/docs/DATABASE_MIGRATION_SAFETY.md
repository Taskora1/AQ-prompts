# Database migration safety

Database-changing scripts must run through `scripts/run-database-migration.mjs`. Direct execution is blocked at the shared PostgreSQL connection layer.

## Rules

- An explicit `--script`, `--target`, and `--env-file` are mandatory.
- `.env` and `.env.local` are never accepted for migrations.
- The environment filename must identify Preview or Production as applicable.
- Dry-run is the default and does not open a database connection.
- Execution requires `--execute` and the typed fingerprint confirmation printed by dry-run.
- Preview requires `VERCEL_ENV=preview` and `PREVIEW_DATABASE_MODE=staging` inside the explicit file.
- Preview refuses the registered Production host/database/user identity.
- Production requires the registered Production identity, `--allow-production`, `ALLOW_PRODUCTION_MIGRATION=true` inside the explicit file, and typed confirmation.
- Migration scripts no longer load Next.js dotenv files themselves. Only approved variables from the explicit file are passed to them.

## Preview workflow

Pull into an ignored, dedicated file:

```powershell
vercel env pull .env.preview.migration --environment=preview --yes
```

Vercel may intentionally omit values for sensitive integration-managed variables. If `DATABASE_URL` is empty, stop: obtain an approved staging-only credential and place it only in this ignored file. Never substitute `.env` or `.env.local`.

Run dry-run first:

```powershell
npm run db:migrate -- --script=migrate-prompts-to-db.mjs --target=preview --env-file=.env.preview.migration
```

Review the target fingerprints and listed operations. Then use the exact confirmation printed by dry-run:

```powershell
npm run db:migrate -- --script=migrate-prompts-to-db.mjs --target=preview --env-file=.env.preview.migration --execute --confirm=PREVIEW:<printed-suffix>
```

## Production workflow

Production capability remains available, but cannot be selected accidentally. Use a dedicated ignored file whose name contains `production`, set `VERCEL_ENV=production` and `ALLOW_PRODUCTION_MIGRATION=true` in that file, run dry-run, verify the registered fingerprints, then execute with both production approvals:

```powershell
npm run db:migrate -- --script=<approved-script> --target=production --env-file=.env.production.migration --execute --allow-production --confirm=PRODUCTION:<printed-suffix>
```

Never commit downloaded or manually prepared environment files. Repository ignore rules already exclude `.env*` except sanctioned examples.
