import crypto from 'node:crypto';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
const ALLOWED_FORMATS = 'jpg,png,webp';
// Same approved Cloudinary overlay watermark as the admin upload route
// (Variant A badge: logo + "AQPROMPTS" + "www.aqprompts.com", 24% of the
// image width, bottom-right, 20 px margin, 92% opacity). Applied by
// Cloudinary at upload time — no sharp, which cannot run on Workers.
const WATERMARK_TRANSFORMATION =
  'l_aqprompts:watermark-badge,c_scale,fl_relative,w_0.24,o_92/fl_layer_apply,g_south_east,x_20,y_20';
const WATERMARK_CONTEXT = 'aqprompts_watermark=v1';
const IMAGE_TYPES = {
  'image/jpeg': {
    extension: 'jpg',
    isValid: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    isValid: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: 'webp',
    isValid: (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP',
  },
};
const BASE64_IMAGE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class McpImageUploadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpImageUploadError';
  }
}

function decodeMcpImage(imageBase64, contentType) {
  const imageType = IMAGE_TYPES[contentType];
  if (!imageType) {
    throw new McpImageUploadError('Images must be JPEG, PNG, or WebP.');
  }
  if (
    typeof imageBase64 !== 'string'
    || imageBase64.length === 0
    || imageBase64.length > MAX_BASE64_LENGTH
    || !BASE64_IMAGE.test(imageBase64)
  ) {
    throw new McpImageUploadError('Provide a valid base64-encoded image no larger than 3 MB.');
  }

  const bytes = Buffer.from(imageBase64, 'base64');
  if (
    bytes.length === 0
    || bytes.length > MAX_IMAGE_BYTES
    || bytes.toString('base64') !== imageBase64
    || !imageType.isValid(bytes)
  ) {
    throw new McpImageUploadError('The image data does not match its declared JPEG, PNG, or WebP format.');
  }
  return { bytes, imageType };
}

function buildSignature(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export async function uploadMcpImageFile({ imageBase64, contentType }) {
  const { bytes, imageType } = decodeMcpImage(imageBase64, contentType);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'aqprompts/production/admin-prompts';

  if (
    !cloudName
    || !/^[a-z0-9-]+$/i.test(cloudName)
    || !apiKey
    || !apiSecret
  ) {
    throw new McpImageUploadError('AQ photo storage is not configured for MCP uploads.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `mcp-${crypto.randomBytes(12).toString('hex')}`;
  const signedParams = {
    allowed_formats: ALLOWED_FORMATS,
    context: WATERMARK_CONTEXT,
    folder,
    public_id: publicId,
    timestamp,
    transformation: WATERMARK_TRANSFORMATION,
  };
  const formData = new FormData();
  formData.set('file', new Blob([bytes], { type: contentType }), `${publicId}.${imageType.extension}`);
  formData.set('api_key', apiKey);
  formData.set('timestamp', String(timestamp));
  formData.set('folder', folder);
  formData.set('public_id', publicId);
  formData.set('allowed_formats', ALLOWED_FORMATS);
  formData.set('context', WATERMARK_CONTEXT);
  formData.set('transformation', WATERMARK_TRANSFORMATION);
  formData.set('signature', buildSignature(signedParams, apiSecret));

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new McpImageUploadError('AQ photo storage could not be reached.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new McpImageUploadError('AQ photo storage returned an invalid response.');
  }
  if (!response.ok) {
    throw new McpImageUploadError('The image could not be stored by AQ photo storage.');
  }

  let storedUrl;
  try {
    storedUrl = new URL(result.secure_url);
  } catch {
    throw new McpImageUploadError('AQ photo storage returned an invalid image URL.');
  }
  if (
    storedUrl.protocol !== 'https:'
    || storedUrl.hostname !== 'res.cloudinary.com'
    || !storedUrl.pathname.includes('/image/upload/')
    || !Number.isSafeInteger(result.bytes)
    || result.bytes < 1
    || result.bytes > 4 * 1024 * 1024
    || !['jpg', 'png', 'webp'].includes(String(result.format).toLowerCase())
  ) {
    throw new McpImageUploadError('The uploaded image must be JPEG, PNG, or WebP and no larger than 4 MB.');
  }

  return {
    url: storedUrl.toString(),
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}
