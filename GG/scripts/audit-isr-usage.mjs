import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'src'];
const SHORT_INTERVAL_SECONDS = 3600;
const ENGAGEMENT_ROUTE = /app[\\/]api[\\/]prompts[\\/]\[id\][\\/](view|like|rate|copy)[\\/]route\.[cm]?[jt]sx?$/;
const INTENTIONAL_ROOT_REVALIDATION = new Set([
  'src/lib/admin-prompt-revalidation.js',
]);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git', 'generated'].includes(entry.name)) return [];
      return walk(absolutePath);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [absolutePath] : [];
  });
}

function relative(file) {
  return path.relative(ROOT, file);
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const failures = [];
const observations = {
  revalidateIntervals: 0,
  revalidatePathCalls: 0,
  revalidateTagCalls: 0,
  updateTagCalls: 0,
  unstableCacheCalls: 0,
  cacheLifeCalls: 0,
  cacheTagCalls: 0,
};

function fail(file, source, index, message) {
  failures.push(`${relative(file)}:${lineNumber(source, index)} ${message}`);
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');

  const intervalPatterns = [
    /export\s+const\s+revalidate\s*=\s*(\d+)/g,
    /\brevalidate\s*:\s*(\d+)/g,
  ];

  for (const pattern of intervalPatterns) {
    for (const match of source.matchAll(pattern)) {
      observations.revalidateIntervals += 1;
      const seconds = Number(match[1]);
      if (seconds > 0 && seconds < SHORT_INTERVAL_SECONDS) {
        fail(
          file,
          source,
          match.index,
          `short time-based revalidation interval (${seconds}s; minimum allowed is ${SHORT_INTERVAL_SECONDS}s)`,
        );
      }
    }
  }

  const primitives = [
    ['revalidatePath', /\brevalidatePath\s*\(/g],
    ['revalidateTag', /\brevalidateTag\s*\(/g],
    ['updateTag', /\bupdateTag\s*\(/g],
    ['unstableCache', /\bunstable_cache\s*\(/g],
    ['cacheLife', /\bcacheLife\s*\(/g],
    ['cacheTag', /\bcacheTag\s*\(/g],
  ];

  for (const [name, pattern] of primitives) {
    const matches = [...source.matchAll(pattern)];
    observations[`${name}Calls`] += matches.length;
  }

  for (const match of source.matchAll(/\brevalidatePath\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    const target = match[2];
    const intentionallyBoundedRoot = target === '/'
      && INTENTIONAL_ROOT_REVALIDATION.has(relative(file).replaceAll('\\', '/'));
    if (!intentionallyBoundedRoot && (target === '/' || target === '/:path*' || target.includes('**'))) {
      fail(file, source, match.index, `broad revalidatePath target "${target}"`);
    }
  }

  if (/export\s+(?:async\s+)?function\s+GET\b/.test(source)) {
    const invalidation = /\b(revalidatePath|revalidateTag|updateTag)\s*\(/.exec(source);
    if (invalidation) {
      fail(file, source, invalidation.index, 'cache invalidation is present in a GET handler module');
    }
  }

  if (ENGAGEMENT_ROUTE.test(relative(file))) {
    const invalidation = /\b(revalidatePath|revalidateTag|updateTag|unstable_cache|cacheLife|cacheTag)\s*\(/.exec(source)
      || /\b(?:export\s+const\s+revalidate|revalidate\s*:)\s*/.exec(source);
    if (invalidation) {
      fail(file, source, invalidation.index, 'engagement endpoint must not invalidate or regenerate public HTML/data caches');
    }
  }

  const literalTargets = [...source.matchAll(/\brevalidatePath\s*\(\s*(['"`])([^'"`]+)\1/g)]
    .map((match) => match[2]);
  const duplicates = literalTargets.filter((target, index) => literalTargets.indexOf(target) !== index);
  if (duplicates.length > 0) {
    const first = source.indexOf('revalidatePath');
    fail(file, source, first, `duplicate revalidatePath target(s): ${[...new Set(duplicates)].join(', ')}`);
  }

  const unsafeLoop = /\.(?:forEach|map)\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*revalidatePath\s*\(/.exec(source);
  if (unsafeLoop && !/new\s+Set\s*\(/.test(source)) {
    fail(file, source, unsafeLoop.index, 'looped revalidation is not visibly deduplicated with Set');
  }
}

console.log(`[isr-audit] scanned ${files.length} source files`);
console.log(
  `[isr-audit] intervals=${observations.revalidateIntervals}, `
  + `revalidatePath=${observations.revalidatePathCalls}, `
  + `revalidateTag=${observations.revalidateTagCalls}, `
  + `updateTag=${observations.updateTagCalls}, `
  + `unstable_cache=${observations.unstableCacheCalls}, `
  + `cacheLife=${observations.cacheLifeCalls}, `
  + `cacheTag=${observations.cacheTagCalls}`,
);

if (failures.length > 0) {
  failures.forEach((finding) => console.error(`FAIL: ${finding}`));
  console.error(`[isr-audit] ${failures.length} unsafe pattern(s) found`);
  process.exit(1);
}

console.log('[isr-audit] PASS: no unsafe ISR write pattern found');
