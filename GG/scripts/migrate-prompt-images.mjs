import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const promptsFile = path.join(root, 'public', 'data', 'prompts-index.json');
const backupFile = `${promptsFile}.backup`;
const addEmptySecondSlot = process.argv.includes('--empty-second-slot');

function normalizeImages(prompt = {}) {
  const existingImages = Array.isArray(prompt.images)
    ? prompt.images.map((image) => String(image || '').trim()).filter(Boolean)
    : [];
  const legacyImage = String(prompt.image || '').trim();
  const images = [...new Set([...existingImages, legacyImage].filter(Boolean))];

  if (addEmptySecondSlot && images.length === 1) {
    return [images[0], ''];
  }

  return images;
}

if (!fs.existsSync(promptsFile)) {
  throw new Error(`Prompts file not found: ${promptsFile}`);
}

if (!fs.existsSync(backupFile)) {
  fs.copyFileSync(promptsFile, backupFile);
  console.log(`Backup created: ${backupFile}`);
} else {
  console.log(`Backup already exists: ${backupFile}`);
}

const payload = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
const prompts = Array.isArray(payload.prompts) ? payload.prompts : [];
let migratedCount = 0;
let oneImageCount = 0;

payload.prompts = prompts.map((prompt) => {
  const images = normalizeImages(prompt);
  const validImageCount = images.filter(Boolean).length;

  if (validImageCount === 1) {
    oneImageCount += 1;
  }

  if (!Array.isArray(prompt.images) || prompt.images.join('|') !== images.join('|')) {
    migratedCount += 1;
  }

  return {
    ...prompt,
    images,
  };
});

fs.writeFileSync(promptsFile, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Prompts processed: ${prompts.length}`);
console.log(`Prompts migrated/updated: ${migratedCount}`);
console.log(`Prompts with only one valid image: ${oneImageCount}`);
console.log('Add real second image URLs to the images arrays when they are ready.');
