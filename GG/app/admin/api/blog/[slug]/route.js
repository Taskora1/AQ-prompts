import { after, NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { revalidateBlogContent } from '@/lib/blog-revalidation';
import { submitToIndexNow } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/seo';
import { getAuthorProfileBySlug, toAuthorMeta } from '@/lib/author-profiles-db';
import {
  getBlogPostBySlug,
  updateBlogPost,
  deleteBlogPost,
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

export async function GET(request, { params }) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const { slug } = await params;
    const post = await getBlogPostBySlug(slug);

    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        content: post.content || post.contentHtml || '',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load post.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const { slug } = await params;
    const body = await request.json();
    const {
      title, slug: newSlug, description, excerpt, category, author, authorSlug, date,
      readingTime, featuredImage, featuredImageAltText, tags,
      content, status, contentHtml, contentText, faqs, toc, meta,
    } = body;

    const targetSlug = newSlug || slug;
    const nextStatus = status == null
      ? null
      : status === 'published'
        ? 'published'
        : 'draft';

    // Check if the original post exists
    const existingPost = await getBlogPostBySlug(slug);
    if (!existingPost) {
      return NextResponse.json({ error: 'Original post not found.' }, { status: 404 });
    }

    const authorProfile = authorSlug ? await getAuthorProfileBySlug(authorSlug) : null;
    if (authorSlug && !authorProfile) {
      return NextResponse.json({ error: 'The selected author profile does not exist.' }, { status: 400 });
    }

    // If slug changed, check new slug doesn't conflict
    if (targetSlug !== slug) {
      const conflictingPost = await getBlogPostBySlug(targetSlug);
      if (conflictingPost) {
        return NextResponse.json({ error: 'A post with the new slug already exists.' }, { status: 409 });
      }
    }

    // Alt text validation — mandatory when publishing
    if (nextStatus === 'published' && featuredImage && !(featuredImageAltText || '').trim()) {
      return NextResponse.json({
        error: 'Please add alt text to the featured image before publishing.',
        fields: { featuredImageAltText: 'Alt text is required for publishing.' },
      }, { status: 400 });
    }

    // Update post in Neon
    const updatedPost = await updateBlogPost(slug, {
      slug: targetSlug,
      title: title ?? existingPost.title,
      excerpt: excerpt ?? description ?? existingPost.excerpt,
      // content_html is canonical — always use provided value or existing
      content: content ?? existingPost.content,
      contentHtml: contentHtml ?? existingPost.contentHtml ?? '',
      contentText: contentText ?? existingPost.contentText ?? '',
      featuredImage: featuredImage ?? existingPost.featuredImage,
      featuredImageAlt: featuredImageAltText ?? existingPost.featuredImageAlt,
      author: (authorProfile?.name || author) ?? existingPost.author,
      authorMeta: authorProfile ? toAuthorMeta(authorProfile) : existingPost.authorMeta,
      category: category ?? existingPost.category,
      tags: tags ?? existingPost.tags,
      status: nextStatus ?? existingPost.status,
      publishDate: date ?? existingPost.publishDate,
      readingTime: readingTime ?? existingPost.readingTime,
      seoTitle: title ?? existingPost.seoTitle,
      seoDescription: description ?? excerpt ?? existingPost.seoDescription,
      canonicalUrl: existingPost.canonicalUrl,
      ogImage: featuredImage || existingPost.ogImage,
      ogImageAlt: featuredImageAltText || existingPost.ogImageAlt,
      faqs: faqs ?? existingPost.faqs,
      toc: toc ?? existingPost.toc,
      meta: meta ?? existingPost.meta,
      keywords: (tags ?? existingPost.tags ?? []).join(', '),
    });

    if (!updatedPost) {
      return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 });
    }
    if (nextStatus && updatedPost.status !== nextStatus) {
      return NextResponse.json({ error: 'The post status was not persisted.' }, { status: 500 });
    }

    // Invalidate cache so public pages show updated content
    // If slug changed, invalidate both old and new URLs
    revalidateBlogContent('update', targetSlug);
    if (targetSlug !== slug) {
      revalidateBlogContent('update', slug);
    }
    if (updatedPost.status === 'published' || existingPost.status === 'published') {
      const urls = [];
      if (updatedPost.status === 'published') {
        urls.push(`${SITE_URL}/blog/${targetSlug}`);
      }
      if (existingPost.status === 'published' && targetSlug !== slug) {
        urls.push(`${SITE_URL}/blog/${slug}`);
      }
      if (urls.length > 0) {
        after(() =>
          submitToIndexNow(urls).catch((error) => {
            console.error('IndexNow blog submission error:', error);
          })
        );
      }
    }

    return NextResponse.json({ success: true, slug: targetSlug, post: updatedPost });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update post.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const { slug } = await params;
    const deleted = await deleteBlogPost(slug);

    if (!deleted) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    // Invalidate cache so public pages no longer show deleted post
    revalidateBlogContent('delete', slug);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete post.' }, { status: 500 });
  }
}
