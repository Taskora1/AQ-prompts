import fs from 'node:fs/promises';
import path from 'node:path';

import { list, put } from '@vercel/blob';

const imageGroups = [
  {
    localDirectory: path.join(process.cwd(), 'public', 'images', 'prompts'),
    blobPrefix: 'prompts',
  },
  {
    localDirectory: path.join(process.cwd(), 'public', 'images', 'prompt-thumbs'),
    blobPrefix: 'prompt-thumbs',
  },
];
const uploadConcurrency = 6;
let getPgPool;

async function getLocalImages() {
  const groups = await Promise.all(
    imageGroups.map(async ({ localDirectory, blobPrefix }) => {
      const directoryEntries = await fs.readdir(localDirectory, { withFileTypes: true });
      const files = directoryEntries
        .filter((entry) => entry.isFile())
        .map((entry) => ({
          filename: entry.name,
          localPath: path.join(localDirectory, entry.name),
          pathname: `${blobPrefix}/${entry.name}`,
        }))
        .sort((a, b) => a.pathname.localeCompare(b.pathname));

      return Promise.all(
        files.map(async (file) => ({
          ...file,
          size: (await fs.stat(file.localPath)).size,
        })),
      );
    }),
  );

  return groups.flat();
}

async function getExistingBlobs() {
  const blobs = [];
  let cursor;

  do {
    const result = await list({ cursor, limit: 1000 });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return new Map(blobs.map((blob) => [blob.pathname, blob]));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );

  return results;
}

async function uploadImages(localImages, existingBlobs) {
  let uploaded = 0;
  let skipped = 0;

  const blobs = await mapWithConcurrency(
    localImages,
    uploadConcurrency,
    async (file, index) => {
      const existing = existingBlobs.get(file.pathname);

      if (existing?.size === file.size) {
        skipped += 1;
        return existing;
      }

      const body = await fs.readFile(file.localPath);
      const blob = await put(file.pathname, body, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: Boolean(existing),
        cacheControlMaxAge: 31_536_000,
        contentType: 'image/webp',
      });
      uploaded += 1;

      const completed = uploaded + skipped;
      if (completed % 25 === 0 || index === localImages.length - 1) {
        console.log(`Blob progress: ${completed}/${localImages.length}`);
      }

      return {
        ...blob,
        size: file.size,
      };
    },
  );

  return {
    blobByPathname: new Map(blobs.map((blob) => [blob.pathname, blob])),
    uploaded,
    skipped,
  };
}

function getFilename(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  try {
    return path.posix.basename(new URL(text).pathname);
  } catch {
    return path.posix.basename(text.replaceAll('\\', '/'));
  }
}

function getFullImageBlobUrl(value, blobByPathname) {
  const filename = getFilename(value);
  if (!filename) return null;

  const blob = blobByPathname.get(`prompts/${filename}`);
  if (!blob) {
    throw new Error(`No uploaded full-size Blob was found for ${filename}.`);
  }

  return blob.url;
}

async function updatePromptRows(db, blobByPathname) {
  const promptResult = await db.query(
    'SELECT id, image, images FROM prompts ORDER BY id',
  );

  await db.query('BEGIN');

  try {
    for (const row of promptResult.rows) {
      const image = getFullImageBlobUrl(row.image, blobByPathname);
      const images = Array.isArray(row.images)
        ? row.images.map((value) => getFullImageBlobUrl(value, blobByPathname))
        : [];

      await db.query(
        'UPDATE prompts SET image = $1, images = $2::jsonb WHERE id = $3',
        [image, JSON.stringify(images), row.id],
      );
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return promptResult.rows.length;
}

async function verifyMigration(db, blobByPathname, expectedPromptCount) {
  const result = await db.query(`
    SELECT id, title, slug, image, images
    FROM prompts
    ORDER BY id
  `);
  const invalidRows = result.rows.filter((row) => {
    const urls = [row.image, ...(Array.isArray(row.images) ? row.images : [])].filter(Boolean);
    return urls.some((url) => !/^https:\/\/.+\.public\.blob\.vercel-storage\.com\//.test(url));
  });

  if (result.rows.length !== expectedPromptCount || invalidRows.length > 0) {
    throw new Error(
      `Database verification failed: found ${result.rows.length} rows and ${invalidRows.length} rows with non-Blob image URLs.`,
    );
  }

  const samples = result.rows.slice(0, 3);
  const urlChecks = [];

  for (const row of samples) {
    const filename = getFilename(row.image);
    const thumbnailUrl = blobByPathname.get(`prompt-thumbs/${filename}`)?.url;

    for (const [kind, url] of [['image', row.image], ['thumbnail', thumbnailUrl]]) {
      if (!url) {
        throw new Error(`Missing ${kind} URL for prompt ${row.id}.`);
      }

      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      urlChecks.push({
        promptId: row.id,
        kind,
        url,
        status: response.status,
        contentType: response.headers.get('content-type'),
      });

      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`${kind} URL failed verification for prompt ${row.id}: HTTP ${response.status}.`);
      }
    }
  }

  return { samples, urlChecks };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN is required.');
  }

  const localImages = await getLocalImages();
  const expectedFullImages = localImages.filter((file) => file.pathname.startsWith('prompts/')).length;
  const expectedThumbnails = localImages.filter((file) => file.pathname.startsWith('prompt-thumbs/')).length;
  const existingBlobs = await getExistingBlobs();

  console.log(
    `Preparing ${expectedFullImages} full images and ${expectedThumbnails} thumbnails for Blob.`,
  );

  const { blobByPathname, uploaded, skipped } = await uploadImages(localImages, existingBlobs);

  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();
  const updatedRows = await updatePromptRows(db, blobByPathname);
  const verification = await verifyMigration(db, blobByPathname, updatedRows);

  console.log(
    `Blob migration complete: ${uploaded} uploaded, ${skipped} already current, ${updatedRows} prompt rows updated.`,
  );
  console.log('Sample database rows:');
  console.log(JSON.stringify(verification.samples, null, 2));
  console.log('Remote URL checks:');
  console.log(JSON.stringify(verification.urlChecks, null, 2));
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Prompt image migration failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration failed before initialization.
    }
  });
