import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const filenames = [
  'luxury-mens-fashion-ai-prompts.webp',
  'all-black-executive-city-ai-portrait.webp',
  'double-breasted-hotel-fashion-ai-portrait.webp',
  'luxury-mirror-fashion-ai-portrait.webp',
  'black-blazer-white-shirt-ai-portrait.webp',
  'all-white-studio-mens-ai-portrait.webp',
  'ocean-view-luxury-mens-ai-portrait.webp',
];

const sourceDir = path.join(process.cwd(), 'public', 'uploads');
const outputDir = path.join(sourceDir, 'responsive');
await fs.mkdir(outputDir, { recursive: true });

for (const filename of filenames) {
  const stem = filename.replace(/\.webp$/i, '');
  for (const width of [480, 960]) {
    await sharp(path.join(sourceDir, filename))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 74, effort: 5 })
      .toFile(path.join(outputDir, `${stem}-${width}.webp`));
  }
}

console.log(`Generated ${filenames.length * 2} responsive WebP files.`);
