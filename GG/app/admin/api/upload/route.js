import crypto from 'node:crypto';

import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { ImageWatermarkError, watermarkImage } from '@/lib/image-watermark';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const SAFE_PUBLIC_ID = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const RASTER_FORMATS = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const ALLOWED_RASTER_FORMATS = 'jpg,png,webp';
const WATERMARK_CONTEXT = 'aqprompts_watermark=v1';

export const runtime = 'nodejs';

function jsonError(message, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function safePublicId(filename = '') {
  const dotIndex = filename.lastIndexOf('.');
  const basename = (dotIndex >= 0 ? filename.slice(0, dotIndex) : filename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  const random = crypto.randomBytes(6).toString('hex');
  return `${basename || 'prompt-image'}-${random}`;
}

function buildSignature(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${payload}${apiSecret}`)
    .digest('hex');
}

export async function POST(request) {
  try {
    let adminUser;
    try {
      adminUser = await getCurrentAdminUser();
    } catch (error) {
      console.error('Admin image upload authentication failed:', error);
      return jsonError('Authentication failed.', 401);
    }
    if (!adminUser) {
      return jsonError('Unauthorized.', 401);
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'aqprompts/production/admin-prompts';

    if (!cloudName || !/^[a-z0-9-]+$/i.test(cloudName) || !apiKey || !apiSecret) {
      return jsonError('Cloudinary image upload is not configured yet.', 503);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError('Could not parse the upload request.', 400);
    }

    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonError('Choose an image file to upload.');
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return jsonError('Images must be JPEG, PNG, WebP, or SVG files.');
    }
    if (file.size === 0) {
      return jsonError('The selected file is empty.');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return jsonError('The image is too large. Maximum supported size is 4 MB.');
    }

    const isSvg = file.type === 'image/svg+xml';
    let uploadFile = file;
    let uploadExtension = 'svg';
    let width;
    let height;
    let watermarked = false;

    if (!isSvg) {
      const input = Buffer.from(await file.arrayBuffer());
      const processed = await watermarkImage(input, RASTER_FORMATS[file.type]);
      uploadFile = new Blob([processed.buffer], { type: processed.mimeType });
      uploadExtension = processed.extension;
      width = processed.width;
      height = processed.height;
      watermarked = processed.watermarked;
    }

    const publicId = safePublicId(file.name);
    if (!SAFE_PUBLIC_ID.test(publicId)) {
      return jsonError('Invalid upload filename.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      folder,
      public_id: publicId,
      timestamp,
      ...(watermarked
        ? { allowed_formats: ALLOWED_RASTER_FORMATS, context: WATERMARK_CONTEXT }
        : {}),
    };
    const signature = buildSignature(signedParams, apiSecret);

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.set('file', uploadFile, `${publicId}.${uploadExtension}`);
    cloudinaryFormData.set('api_key', apiKey);
    cloudinaryFormData.set('timestamp', String(timestamp));
    cloudinaryFormData.set('folder', folder);
    cloudinaryFormData.set('public_id', publicId);
    cloudinaryFormData.set('signature', signature);
    if (watermarked) {
      cloudinaryFormData.set('allowed_formats', ALLOWED_RASTER_FORMATS);
      cloudinaryFormData.set('context', WATERMARK_CONTEXT);
    }

    const resourceType = isSvg ? 'raw' : 'image';
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        body: cloudinaryFormData,
      });
    } catch (error) {
      console.error('Cloudinary image upload request failed:', error);
      return jsonError('The image storage service could not be reached.', 502);
    }

    const contentType = response.headers.get('content-type') || '';
    let result;
    if (contentType.includes('application/json')) {
      try {
        result = await response.json();
      } catch {
        return jsonError('Could not parse Cloudinary response.', 502);
      }
    } else {
      console.error('Cloudinary image upload returned a non-JSON response.', {
        status: response.status,
        contentType,
      });
      return jsonError('The image could not be uploaded to Cloudinary.', 502);
    }

    if (!response.ok) {
      console.error('Cloudinary image upload failed:', result?.error || result);
      return jsonError('The image could not be uploaded to Cloudinary.', 502);
    }

    let storedUrl;
    try {
      storedUrl = new URL(result?.secure_url);
    } catch {
      console.error('Cloudinary image upload returned an invalid URL.');
      return jsonError('Cloudinary returned an invalid image URL.', 502);
    }
    if (storedUrl.protocol !== 'https:' || typeof result.public_id !== 'string') {
      console.error('Cloudinary image upload returned incomplete metadata.');
      return jsonError('Cloudinary returned incomplete image details.', 502);
    }

    return NextResponse.json({
      url: storedUrl.toString(),
      secureUrl: storedUrl.toString(),
      publicId: result.public_id,
      width: width ?? result.width,
      height: height ?? result.height,
      format: result.format,
      watermarked,
    });
  } catch (error) {
    if (error instanceof ImageWatermarkError) {
      return jsonError(error.message, error.status);
    }
    console.error('Admin image upload failed:', error);
    return jsonError('The image upload could not be completed.', 500);
  }
}
