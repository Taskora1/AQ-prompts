import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import sharp from 'sharp';

const publicDirectory = new URL('../public/', import.meta.url);

test('brand logo and app icon assets use the supplied square artwork', async () => {
  const expectedDimensions = new Map([
    ['aqprompts-logo.webp', 512],
    ['aqprompts-navbar-logo.webp', 512],
    ['aqprompts-logo-icon.png', 180],
    ['apple-touch-icon.png', 180],
    ['favicon-32x32.png', 32],
  ]);

  for (const [filename, size] of expectedDimensions) {
    const metadata = await sharp(fileURLToPath(new URL(filename, publicDirectory))).metadata();
    assert.equal(metadata.width, size, `${filename} width`);
    assert.equal(metadata.height, size, `${filename} height`);
  }
});

test('favicon and image-watermark SVGs embed the replacement logo', async () => {
  for (const filename of ['favicon.svg', 'aqprompts-icon.svg']) {
    const svg = await readFile(new URL(filename, publicDirectory), 'utf8');
    assert.match(svg, /<image\b/);
    assert.match(svg, /data:image\/png;base64,/);
  }
});

test('install manifest reports the current logo dimensions', async () => {
  const manifest = await readFile(new URL('../app/manifest.js', import.meta.url), 'utf8');
  assert.match(manifest, /src: '\/aqprompts-logo\.webp'/);
  assert.match(manifest, /sizes: '512x512'/);
});
