import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('media library lists asset-folder uploads with a legacy fixed-folder fallback', async () => {
  const [route, component] = await Promise.all([
    readFile(new URL('../app/admin/api/media/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/MediaLibrary.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /\/resources\/by_asset_folder/);
  assert.match(route, /asset_folder/);
  assert.match(route, /if \(response\.status === 404\)/);
  assert.match(route, /\/resources\/image\/upload/);
  assert.match(route, /Authorization: authorization/);
  assert.match(route, /const responseText = await response\.text\(\)/);
  assert.match(route, /Cloudinary returned an unexpected response while loading media/);
  assert.match(route, /sort_by\[0\]\[created_at\]/);
  assert.doesNotMatch(route, /\[object Object\]/);
  assert.match(component, /response\.redirected && response\.url\.includes\('\/admin\/login'\)/);
  assert.match(component, /const responseText = await response\.text\(\)/);
  assert.match(component, /The server returned an unexpected response/);
});
