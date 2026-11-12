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

test('inline brand logos decode to the right-sized WEBP artwork', async () => {
  // The navbar (128px) and loader (256px) logos are inlined as data URIs
  // in src/lib/brand-logos.js (the right-sized files are binary and cannot
  // be pushed to GitHub from here). Guard against a corrupted or swapped
  // inline copy: RIFF/WEBP magic + the exact byte lengths of the source
  // files (6,096 B navbar, 12,100 B loader), plus the square dimensions.
  const module = await import('../src/lib/brand-logos.js');
  const expected = new Map([
    ['NAVBAR_LOGO_DATA_URI', { bytes: 6096, size: 128 }],
    ['LOADER_LOGO_DATA_URI', { bytes: 12100, size: 256 }],
  ]);
  for (const [name, { bytes, size }] of expected) {
    const uri = module[name];
    assert.match(uri, /^data:image\/webp;base64,/);
    const buf = Buffer.from(uri.replace(/^data:image\/webp;base64,/, ''), 'base64');
    assert.equal(buf.length, bytes, `${name} byte length`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `${name} RIFF magic`);
    assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', `${name} WEBP magic`);
    const metadata = await sharp(buf).metadata();
    assert.equal(metadata.width, size, `${name} width`);
    assert.equal(metadata.height, size, `${name} height`);
  }
});

test('favicon and image-watermark SVGs embed the replacement logo', async () => {
  // favicon.svg was removed (the favicon is favicon-32x32.png now and
  // nothing references the SVG), so only the surviving icon SVG is checked.
  for (const filename of ['aqprompts-icon.svg']) {
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
