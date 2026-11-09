import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const MAX_IMAGE_PIXELS = 40_000_000;
const WATERMARK_NAMESPACE = 'https://www.aqprompts.com/ns/watermark/1.0/';
const WATERMARK_XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:aqp="${WATERMARK_NAMESPACE}" aqp:Watermarked="true" aqp:Version="1"/></rdf:RDF></x:xmpmeta>`;
const LOGO_PATH = path.join(process.cwd(), 'public', 'aqprompts-icon.svg');
let logoPromise;

const FORMAT_CONFIG = {
  jpeg: {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    options: { quality: 90, mozjpeg: true, progressive: true },
  },
  png: {
    mimeType: 'image/png',
    extension: 'png',
    options: { compressionLevel: 9, adaptiveFiltering: true },
  },
  webp: {
    mimeType: 'image/webp',
    extension: 'webp',
    options: { quality: 90, effort: 5, smartSubsample: true },
  },
};

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  a: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  c: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  m: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  o: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  p: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  q: ['01110', '10001', '10001', '10001', '01111', '00001', '00001'],
  r: ['11110', '10001', '10000', '10000', '10000', '10000', '10000'],
  s: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  t: ['00100', '00100', '11111', '00100', '00100', '00100', '00011'],
  w: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
};

function vectorTextWidth(text, fontSize) {
  return Math.ceil((text.length * 6 - 1) * (fontSize / 7));
}

function createVectorText(text, fontSize, x, y) {
  const cellSize = fontSize / 7;
  const shapes = [];

  for (const [characterIndex, character] of [...text].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) continue;

    for (const [rowIndex, row] of glyph.entries()) {
      for (const [columnIndex, pixel] of [...row].entries()) {
        if (pixel !== '1') continue;
        const left = x + (characterIndex * 6 + columnIndex) * cellSize;
        const top = y + rowIndex * cellSize;
        shapes.push(
          `<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#ffffff"/>`,
        );
      }
    }
  }

  return shapes.join('');
}

export class ImageWatermarkError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ImageWatermarkError';
    this.status = status;
  }
}

function getLogoSvg() {
  logoPromise ??= readFile(LOGO_PATH);
  return logoPromise;
}

function createWatermarkLayout(width, height) {
  const shortestSide = Math.min(width, height);
  let logoSize = Math.min(72, Math.max(14, Math.round(shortestSide * 0.11)));

  const measure = (size) => {
    const padding = Math.max(4, Math.round(size * 0.22));
    const gap = Math.max(3, Math.round(size * 0.18));
    const titleSize = Math.max(7, Math.round(size * 0.27));
    const urlSize = Math.max(7, Math.round(size * 0.19));
    const lineGap = Math.max(2, Math.round(size * 0.08));
    const textWidth = Math.max(
      vectorTextWidth('AQPROMPTS', titleSize),
      vectorTextWidth('www.aqprompts.com', urlSize),
    );
    const textHeight = titleSize + lineGap + urlSize;
    const contentHeight = Math.max(size, textHeight);
    return {
      logoSize: size,
      padding,
      gap,
      titleSize,
      urlSize,
      lineGap,
      textWidth,
      contentHeight,
      width: padding * 2 + size + gap + textWidth,
      height: padding * 2 + contentHeight,
    };
  };

  let layout = measure(logoSize);
  const maximumWidth = Math.max(1, Math.floor(width * 0.75));
  if (layout.width > maximumWidth) {
    logoSize = Math.max(10, Math.floor(logoSize * (maximumWidth / layout.width)));
    layout = measure(logoSize);
  }
  return layout;
}

async function createWatermarkOverlay(width, height) {
  const layout = createWatermarkLayout(width, height);
  const logo = await sharp(await getLogoSvg())
    .resize(layout.logoSize, layout.logoSize, { fit: 'contain' })
    .png()
    .toBuffer();
  const logoData = logo.toString('base64');
  const logoTop = Math.round((layout.height - layout.logoSize) / 2);
  const textLeft = layout.padding + layout.logoSize + layout.gap;
  const textHeight = layout.titleSize + layout.lineGap + layout.urlSize;
  const textTop = Math.round((layout.height - textHeight) / 2);
  const cornerRadius = Math.max(4, Math.round(layout.height * 0.16));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><g opacity="0.82"><rect x="0.5" y="0.5" width="${layout.width - 1}" height="${layout.height - 1}" rx="${cornerRadius}" fill="#10131b" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.22"/><image href="data:image/png;base64,${logoData}" x="${layout.padding}" y="${logoTop}" width="${layout.logoSize}" height="${layout.logoSize}"/>${createVectorText('AQPROMPTS', layout.titleSize, textLeft, textTop)}${createVectorText('www.aqprompts.com', layout.urlSize, textLeft, textTop + layout.titleSize + layout.lineGap)}</g></svg>`,
  );
  const margin = Math.max(4, Math.round(Math.min(width, height) * 0.025));

  return {
    input: await sharp(svg).png().toBuffer(),
    left: Math.max(0, width - layout.width - margin),
    top: Math.max(0, height - layout.height - margin),
  };
}

export async function watermarkImage(input, expectedFormat) {
  const config = FORMAT_CONFIG[expectedFormat];
  if (!config) {
    throw new ImageWatermarkError('Images must be JPEG, PNG, or WebP.');
  }
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new ImageWatermarkError('The uploaded image is empty.');
  }

  let image;
  try {
    image = sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    });
  } catch {
    throw new ImageWatermarkError('The image could not be decoded.');
  }

  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new ImageWatermarkError('The image is invalid or could not be decoded.');
  }

  if (metadata.format !== expectedFormat) {
    throw new ImageWatermarkError('The image data does not match its declared file type.');
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new ImageWatermarkError('The image dimensions exceed the supported limit.', 413);
  }
  if (metadata.pages > 1) {
    throw new ImageWatermarkError('Animated images are not supported. Upload a still image instead.');
  }

  const width = metadata.autoOrient?.width || metadata.width;
  const height = metadata.autoOrient?.height || metadata.height;
  const existingXmp = metadata.xmpAsString || metadata.xmp?.toString('utf8') || '';
  const alreadyWatermarked = existingXmp.includes(WATERMARK_NAMESPACE)
    && existingXmp.includes('aqp:Watermarked="true"');

  const pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  }).rotate();

  if (!alreadyWatermarked) {
    pipeline.composite([await createWatermarkOverlay(width, height)]);
  }

  const output = await pipeline
    .toColourspace('srgb')
    .toFormat(expectedFormat, config.options)
    .withXmp(WATERMARK_XMP)
    .toBuffer();

  if (output.length > 16 * 1024 * 1024) {
    throw new ImageWatermarkError('The processed image exceeds the 16 MB upload limit.', 413);
  }

  return {
    buffer: output,
    width,
    height,
    format: expectedFormat,
    mimeType: config.mimeType,
    extension: config.extension,
    watermarked: true,
    alreadyWatermarked,
  };
}
