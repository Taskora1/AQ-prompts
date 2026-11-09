import { after, NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { revalidateBlogContent } from '@/lib/blog-revalidation';
import { submitToIndexNow } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/seo';
import { getAuthorProfileBySlug, toAuthorMeta } from '@/lib/author-profiles-db';
import {
  listBlogPostsForAdmin,
  createBlogPost,
  ensureBlogTable,
} from '@/lib/blog-db';

// Ensure table exists on first request
let tableEnsured = false;

async function ensureTable() {
  if (!tableEnsured) {
    await ensureBlogTable();
    tableEnsured = true;
  }
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function GET() {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    // Read directly from Neon — admin sees ALL posts including drafts
    const posts = await listBlogPostsForAdmin();

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load posts.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const body = await request.json();
    const {
      title, slug, description, excerpt, category, author, authorSlug, date,
      readingTime, featuredImage, featuredImageAltText, tags,
      content, status, contentHtml, contentText, faqs, toc, meta,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    }

    const postSlug = slug || slugify(title);
    if (!postSlug) {
      return NextResponse.json({ error: 'Slug is required.' }, { status: 400 });
    }

    const authorProfile = authorSlug ? await getAuthorProfileBySlug(authorSlug) : null;
    if (authorSlug && !authorProfile) {
      return NextResponse.json({ error: 'The selected author profile does not exist.' }, { status: 400 });
    }

    // Alt text validation — mandatory when publishing
    if (status === 'published' && featuredImage && !(featuredImageAltText || '').trim()) {
      return NextResponse.json({
        error: 'Please add alt text to the featured image before publishing.',
        fields: { featuredImageAltText: 'Alt text is required for publishing.' },
      }, { status: 400 });
    }

    // Create post in Neon
    const post = await createBlogPost({
      slug: postSlug,
      title,
      excerpt: excerpt || description || '',
      content: content || '',
      contentHtml: contentHtml || '',
      contentText: contentText || '',
      featuredImage: featuredImage || '',
      featuredImageAlt: featuredImageAltText || '',
      author: authorProfile?.name || author || adminUser.name || 'Admin',
      authorMeta: authorProfile ? toAuthorMeta(authorProfile) : null,
      category: category || 'Creator Growth',
      tags: tags || [],
      status: status || 'draft',
      publishDate: date || new Date().toISOString().slice(0, 10),
      readingTime: readingTime || 5,
      seoTitle: title,
      seoDescription: description || excerpt || '',
      canonicalUrl: '',
      ogImage: featuredImage || '',
      ogImageAlt: featuredImageAltText || '',
      faqs: faqs || [],
      toc: toc || [],
      meta: meta || {},
      keywords: (tags || []).join(', '),
    });

    // Invalidate cache so public pages show new content
    revalidateBlogContent('create', postSlug);
    if (post.status === 'published') {
      after(() =>
        submitToIndexNow([`${SITE_URL}/blog/${postSlug}`]).catch((error) => {
          console.error('IndexNow blog submission error:', error);
        })
      );
    }

    return NextResponse.json({ success: true, slug: postSlug, post });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create post.' }, { status: 500 });
  }
}
