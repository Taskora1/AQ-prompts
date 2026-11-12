import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'public', 'images', 'prompts');
const outputDir = path.join(projectRoot, 'public', 'images', 'prompt-thumbs');
const manifestPath = path.join(outputDir, '.thumbnail-manifest.json');
const supportedExtensions = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const targetWidth = 640;
// Small variant for grid cards: cards display at most ~292-378 CSS px, so a
// 360px-wide thumb lets low-DPR browsers download ~60% fewer bytes while
// high-DPR browsers still get the 640px file via srcSet (see
// getPromptThumbnailSrcSet in src/lib/prompt-images.js). Generated at build
// time by prebuild, so no binary files need to be committed for it.
const smallTargetWidth = 360;
const quality = 58;

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Compute a fast, deterministic SHA-256 hex digest of a file's contents. */
async function fileHash(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Recursively collect all supported image files under `dir`. */
async function getImageFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getImageFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

async function readManifest() {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeManifest(manifest) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Thumbnail generation
// ---------------------------------------------------------------------------

async function generateVariant(sourcePath, outputPath, width) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toFile(outputPath);
}

async function generateThumbnail(sourcePath, manifest) {
  const relativePath = path.relative(sourceDir, sourcePath);
  const parsed = path.parse(relativePath);
  const outputPath = path.join(outputDir, parsed.dir, `${parsed.name}.webp`);
  const smallOutputPath = path.join(outputDir, parsed.dir, `${parsed.name}-360.webp`);

  // --- Freshness check: content-hash manifest + both variants on disk ---
  const sourceHash = await fileHash(sourcePath);
  const manifestEntry = manifest[relativePath];
  const hashMatches = manifestEntry && manifestEntry.hash === sourceHash;

  const mainExists = await pathExists(outputPath);
  const smallExists = await pathExists(smallOutputPath);
  if (hashMatches && mainExists && smallExists) {
    return { skipped: true, outputPath };
  }

  // --- Regenerate whichever variant is missing or stale ---
  // A changed source regenerates both; a fresh source with only the small
  // variant missing (e.g. first build after this was added) regenerates
  // just the small one.
  if (!hashMatches || !mainExists) {
    await generateVariant(sourcePath, outputPath, targetWidth);
  }
  if (!hashMatches || !smallExists) {
    await generateVariant(sourcePath, smallOutputPath, smallTargetWidth);
  }

  // Update manifest entry.
  manifest[relativePath] = { hash: sourceHash };

  return { skipped: false, outputPath };
}

async function main() {
  if (!(await pathExists(sourceDir))) {
    console.log('[prompt-thumbnails] source folder not found; skipping.');
    return;
  }

  const imageFiles = await getImageFiles(sourceDir);
  const manifest = await readManifest();
  let created = 0;
  let skipped = 0;

  for (const imageFile of imageFiles) {
    const result = await generateThumbnail(imageFile, manifest);
    if (result.skipped) skipped += 1;
    else created += 1;
  }

  // Persist the updated manifest (new/changed hashes).
  await writeManifest(manifest);

  console.log(
    `[prompt-thumbnails] ${created} generated, ${skipped} already fresh, ${imageFiles.length} total.`
  );
}

main().catch(() => {
  console.error('[prompt-thumbnails] failed.');
  process.exit(1);
});
