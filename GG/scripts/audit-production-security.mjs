import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import nextEnv from '@next/env';

const root = process.cwd();
nextEnv.loadEnvConfig(root, false);
const failures = [];
const warnings = [];
const secretNames = [
  'AUTH_SECRET',
  'ADMIN_PASSWORD',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'PROMPTSHE_TRIAL_SHARED_SECRET',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SIGNING_SECRET',
  'KV_REST_API_TOKEN',
  'BLOB_READ_WRITE_TOKEN',
];
const excludedDirectories = new Set(['.git', '.next', '.vercel', 'node_modules']);
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.txt', '.xml']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const publicFiles = walk(path.join(root, 'public'));
for (const file of publicFiles) {
  const relative = path.relative(path.join(root, 'public'), file).replaceAll('\\', '/');
  if (
    /(?:^|\/)(?:\.env|\.git|docs?|content|backups?|logs?)(?:\/|$)/i.test(relative)
    || /\.(?:sql|bak|dump|log|map)$/i.test(relative)
  ) {
    failures.push(`Unexpected public internal file: public/${relative}`);
  }
}

const sourceFiles = [
  ...walk(path.join(root, 'app')),
  ...walk(path.join(root, 'src')),
  ...walk(path.join(root, 'scripts')),
  ...['next.config.js', 'proxy.js', 'vercel.json', 'package.json']
    .map((name) => path.join(root, name))
    .filter((file) => fs.existsSync(file)),
].filter((file) => sourceExtensions.has(path.extname(file).toLowerCase()));
const literalSecretPatterns = [
  /\b(?:sk_live|sk_test|pdl_live_apikey|pdl_sdbx_apikey|re_[A-Za-z0-9]{20,})_[A-Za-z0-9_-]{16,}/,
  /postgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (literalSecretPatterns.some((pattern) => pattern.test(source))) {
    failures.push(`Possible literal credential in ${path.relative(root, file)}`);
  }
}

const publicBuildDirectories = [
  path.join(root, '.next', 'static'),
  path.join(root, 'public'),
].filter((directory) => fs.existsSync(directory));
const publicBuildFiles = publicBuildDirectories.flatMap(walk)
  .filter((file) => !/\.(?:png|jpe?g|webp|gif|ico|woff2?)$/i.test(file));
for (const name of secretNames) {
  const secret = String(process.env[name] || '');
  if (secret.length < 12) continue;
  for (const file of publicBuildFiles) {
    const source = fs.readFileSync(file);
    if (source.includes(Buffer.from(secret))) {
      failures.push(`${name}: server-only value found in public/build output`);
      break;
    }
  }
}

for (const file of publicBuildFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (/[A-Z]:\\Users\\[^"'`\s]+/i.test(source)) {
    failures.push(`Internal Windows user path found in public/build output: ${path.relative(root, file)}`);
  }
  if (/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i.test(source)) {
    warnings.push(`Development URL found in public/build output: ${path.relative(root, file)}`);
  }
}

const sourceMaps = publicBuildFiles.filter((file) => file.endsWith('.map'));
if (sourceMaps.length) warnings.push(`${sourceMaps.length} public source map(s) found`);

for (const warning of [...new Set(warnings)]) console.warn(`WARNING: ${warning}`);
for (const failure of [...new Set(failures)]) console.error(`FAIL: ${failure}`);
console.log(`[production-security] ${new Set(failures).size} failure(s), ${new Set(warnings).size} warning(s)`);
if (failures.length) process.exitCode = 1;
