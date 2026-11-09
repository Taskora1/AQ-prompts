import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { deleteSiteReview, setSiteReviewStatus, updateSiteReviewProfile } from '@/lib/site-reviews-db';

function validProfileImageUrl(value) {
  if (!value) return true;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validSocialUrl(value) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function PATCH(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid review ID.' }, { status: 400 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    if (Object.hasOwn(input || {}, 'status')) {
      if (!['approved', 'rejected'].includes(input.status)) {
        return NextResponse.json({ error: 'Choose approve or reject.' }, { status: 400 });
      }
      const review = await setSiteReviewStatus(id, input.status);
      if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
      return NextResponse.json({ success: true, review });
    }

    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const profileImageUrl = typeof input?.profileImageUrl === 'string' ? input.profileImageUrl.trim() : '';
    const socialUrl = typeof input?.socialUrl === 'string' ? input.socialUrl.trim() : '';
    if (!name || name.length > 100) {
      return NextResponse.json({ error: 'Name is required and must be 100 characters or fewer.' }, { status: 400 });
    }
    if (profileImageUrl.length > 2048 || !validProfileImageUrl(profileImageUrl)) {
      return NextResponse.json({ error: 'Photo must be a site path or HTTPS URL, up to 2,048 characters.' }, { status: 400 });
    }
    if (socialUrl.length > 2048 || !validSocialUrl(socialUrl)) {
      return NextResponse.json({ error: 'Social profile must be an HTTPS URL, up to 2,048 characters.' }, { status: 400 });
    }

    const review = await updateSiteReviewProfile(id, { name, profileImageUrl, socialUrl });
    if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error('Review moderation failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Review could not be updated.' }, { status: 503 });
  }
}

export async function DELETE(_request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid review ID.' }, { status: 400 });
  }

  try {
    const review = await deleteSiteReview(id);
    if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error('Review deletion failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Review could not be deleted.' }, { status: 503 });
  }
}
