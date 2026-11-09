import assert from 'node:assert/strict';
import { test } from 'node:test';

import sharp from 'sharp';

import { watermarkImage } from '../src/lib/image-watermark.js';

const WATERMARK_NAMESPACE = 'https://www.aqprompts.com/ns/watermark/1.0/';

test('watermarks JPEG, PNG, and WebP while preserving oriented dimensions', async (t) => {
  for (const format of ['jpeg', 'png', 'webp']) {
    await t.test(format, async () => {
      const source = await sharp({
        create: {
          width: 400,
          height: 280,
          channels: 4,
          background: { r: 25, g: 90, b: 160, alpha: format === 'png' ? 0.6 : 1 },
        },
      }).toFormat(format).toBuffer();

      const result = await watermarkImage(source, format);
      const metadata = await sharp(result.buffer).metadata();

      assert.equal(metadata.format, format);
      assert.equal(metadata.width, 400);
      assert.equal(metadata.height, 280);
      assert.equal(metadata.xmpAsString.includes(WATERMARK_NAMESPACE), true);
      assert.equal(result.watermarked, true);
      assert.equal(result.alreadyWatermarked, false);

      if (format === 'png') {
        const [outsidePixel, overlayPixel, textRegion] = await Promise.all([
          sharp(result.buffer).extract({ left: 2, top: 2, width: 1, height: 1 }).ensureAlpha().raw().toBuffer(),
          sharp(result.buffer).extract({ left: 370, top: 260, width: 1, height: 1 }).ensureAlpha().raw().toBuffer(),
          sharp(result.buffer).extract({ left: 270, top: 230, width: 120, height: 40 }).removeAlpha().raw().toBuffer(),
        ]);
        assert.equal(outsidePixel[3], 153);
        assert.ok(overlayPixel[3] > outsidePixel[3]);
        const visibleTextPixels = textRegion.reduce((count, channel, index) => (
          index % 3 === 0
          && channel > 180
          && textRegion[index + 1] > 180
          && textRegion[index + 2] > 180
            ? count + 1
            : count
        ), 0);
        assert.ok(visibleTextPixels > 50, 'watermark text should rasterize as visible lettering');
      }

      const repeated = await watermarkImage(result.buffer, format);
      assert.equal(repeated.alreadyWatermarked, true);
      assert.equal(repeated.width, 400);
      assert.equal(repeated.height, 280);
    });
  }
});

test('applies EXIF orientation before compositing and reports display dimensions', async () => {
  const source = await sharp({
    create: {
      width: 240,
      height: 160,
      channels: 3,
      background: { r: 60, g: 90, b: 120 },
    },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();

  const result = await watermarkImage(source, 'jpeg');
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.width, 160);
  assert.equal(result.height, 240);
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 240);
  assert.equal(metadata.orientation, undefined);
});
