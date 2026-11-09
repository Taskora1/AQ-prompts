import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';

export async function GET(request) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'aqprompts/production/admin-prompts';

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Cloudinary not configured.' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const nextCursor = searchParams.get('cursor') || '';
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const maxResults = 30;
    const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
    let response;

    if (search) {
      const escapeExpressionValue = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const expression = `folder:"${escapeExpressionValue(folder)}" AND resource_type:image AND filename:"${escapeExpressionValue(search)}"`;
      const formData = new URLSearchParams({
        expression,
        max_results: String(maxResults),
        'sort_by[0][created_at]': 'desc',
      });
      if (nextCursor) formData.set('next_cursor', nextCursor);

      response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
    } else {
      const assetFolderUrl = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/by_asset_folder`);
      assetFolderUrl.searchParams.set('asset_folder', folder);
      assetFolderUrl.searchParams.set('max_results', String(maxResults));
      assetFolderUrl.searchParams.set('direction', 'desc');
      if (nextCursor) assetFolderUrl.searchParams.set('next_cursor', nextCursor);

      response = await fetch(assetFolderUrl, {
        headers: { Authorization: authorization },
      });

      if (response.status === 404) {
        const legacyUrl = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload`);
        legacyUrl.searchParams.set('max_results', String(maxResults));
        legacyUrl.searchParams.set('prefix', `${folder}/`);
        if (nextCursor) legacyUrl.searchParams.set('next_cursor', nextCursor);
        response = await fetch(legacyUrl, {
          headers: { Authorization: authorization },
        });
      }
    }

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error('Cloudinary media list returned a non-JSON response:', {
        status: response.status,
        contentType: response.headers.get('content-type') || '',
      });
      return NextResponse.json(
        { error: 'Cloudinary returned an unexpected response while loading media.' },
        { status: 502 },
      );
    }

    if (!response.ok) {
      console.error('Cloudinary media list error:', result?.error || result);
      return NextResponse.json({ error: 'Failed to list media.' }, { status: 502 });
    }

    const resources = (result.resources || []).map((r) => ({
      id: r.public_id,
      url: r.secure_url,
      thumbnail: r.secure_url,
      width: r.width,
      height: r.height,
      format: r.format,
      bytes: r.bytes,
      createdAt: r.created_at,
      folder: r.folder,
      filename: r.public_id.split('/').pop(),
    }));

    return NextResponse.json({
      success: true,
      images: resources,
      nextCursor: result.next_cursor || null,
      totalCount: result.total_count || resources.length,
    });
  } catch (error) {
    console.error('Media library error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load media.' }, { status: 500 });
  }
}
