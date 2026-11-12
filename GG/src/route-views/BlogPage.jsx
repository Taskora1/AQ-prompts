'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, ArrowRight, ArrowUp, Grid, List, Clock, User } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ResponsiveImage from '../components/ResponsiveImage';
import NewsletterSignup from '../components/NewsletterSignup';
import useScrollReveal from '../hooks/use-scroll-reveal';
import { formatStableDate } from '../lib/utils';

// Real date for a post, in priority order. publishDate/date come from the
// blog_posts.publish_date column; createdAt is the row's creation timestamp.
// Returns null when the post has no date at all: callers render no date
// rather than a made-up one (there used to be a hardcoded '2026-03-01'
// fallback here, which would have shown "1 March 2026" for a dateless post).
function getPostDate(post) {
  if (!post) return null;
  return post.publishDate || post.date || post.createdAt || post.created_at || null;
}

function PostDate({ post, className }) {
  const date = getPostDate(post);
  if (!date) return null;
  return <span className={className}>{formatStableDate(date)}</span>;
}

// Category shown on every card. The data layer already defaults a missing
// category, but a blank/whitespace-only value can still slip through (that
// is how cards ended up with no category label at all), so the list never
// renders a card without one. 'AI Prompts' is the generic fallback: it is
// the category of the large majority of posts.
function getDisplayCategory(post) {
  const category = String(post?.category || '').trim();
  return category || 'AI Prompts';
}

function getAuthorName(post) {
  return String(post?.author || post?.authorMeta?.name || 'Abdul Qudoos').trim() || 'Abdul Qudoos';
}

function getAuthorUrl(post) {
  if (post?.authorMeta?.authorUrl) return post.authorMeta.authorUrl;
  if (post?.authorMeta?.slug) return `/author/${post.authorMeta.slug}`;
  return '/author/abdul-qudoos';
}

function AuthorByline({ post, className }) {
  return (
    <Link
      href={getAuthorUrl(post)}
      className={`inline-flex items-center gap-1 hover:text-primary hover:underline ${className || ''}`}
    >
      <User className="h-3.5 w-3.5" aria-hidden="true" />
      By {getAuthorName(post)}
    </Link>
  );
}

// Fixed back-to-top control: appears once the list has been scrolled, so
// the footer is reachable on a 34-article page without scrolling all the
// way back up. Bottom-right is free — the WhatsApp button sits mid-right.
function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-6 right-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:right-6"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

const PAGE_SIZE = 12;

const BlogPage = ({ initialPosts = [] }) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(
    () => searchParams.get('category') || 'All'
  );
  const [viewMode, setViewMode] = useState('grid');
  // Load-more paging for the long list: show the first page, then reveal
  // more on demand instead of rendering all 34 cards at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const posts = initialPosts;
  const loading = false;

  const scrollRevealRef = useScrollReveal();

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(posts.map((p) => getDisplayCategory(p))))],
    [posts]
  );

  // A new search or category resets paging to the first page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, deferredSearchQuery]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (searchQuery.trim()) {
      nextParams.set('search', searchQuery.trim());
    } else {
      nextParams.delete('search');
    }

    if (selectedCategory && selectedCategory !== 'All') {
      nextParams.set('category', selectedCategory);
    } else {
      nextParams.delete('category');
    }

    if (nextParams.toString() !== searchParams.toString()) {
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams, searchQuery, selectedCategory]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchCategory = selectedCategory === 'All' || getDisplayCategory(post) === selectedCategory;
      const q = deferredSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        (post.excerpt || '').toLowerCase().includes(q) ||
        getDisplayCategory(post).toLowerCase().includes(q) ||
        (Array.isArray(post.tags) ? post.tags.join(' ').toLowerCase() : '').includes(q);

      return matchCategory && matchSearch;
    });
  }, [deferredSearchQuery, posts, selectedCategory]);

  const featuredPost = filteredPosts[0];
  const showFeaturedSection =
    selectedCategory === 'All' && !deferredSearchQuery.trim() && filteredPosts.length > 0;
  // The featured post is shown in its own Featured section above; exclude it
  // from the All Articles grid/list so it is not duplicated.
  const gridPosts = showFeaturedSection ? filteredPosts.slice(1) : filteredPosts;
  // Only the first page of the list is rendered; the rest loads on demand.
  const visiblePosts = gridPosts.slice(0, visibleCount);
  const hasMorePosts = visibleCount < gridPosts.length;
  return (
    <>

      <div className="min-h-screen text-[var(--text-primary)]">
        <Header />

        <main id="main-content">
          {/* Page Hero */}
          <section className="relative bg-white pt-8 sm:pt-10 pb-4 sm:pb-6 dark:bg-[#0a0a0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] mb-4 sm:mb-6">
                  AQPrompts Blog
                </h1>
                <p className="text-lg sm:text-xl text-[var(--text-secondary)] mb-6 sm:mb-8 leading-relaxed">
                  Expert strategies, proven tips, and actionable insights to accelerate your social media growth
                </p>
                
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto mb-8">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] w-5 h-5" />
                    <Input
                      type="text"
                      placeholder="Search articles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 rounded-full border-[#e5e7eb] bg-[#f9fafb] text-[#111118] focus:border-primary dark:border-white/10 dark:bg-[#111118] dark:text-white"
                    />
                  </div>
                  <div className="flex gap-2" role="group" aria-label="View mode selection">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="rounded-full"
                      aria-label="Grid view"
                      aria-pressed={viewMode === 'grid'}
                    >
                      <Grid className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="rounded-full"
                      aria-label="List view"
                      aria-pressed={viewMode === 'list'}
                    >
                      <List className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap justify-center gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="rounded-full"
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Featured Post */}
          {showFeaturedSection && featuredPost && (
            <section className="pt-2 sm:pt-4 pb-8 sm:pb-10">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-4 sm:mb-6">
                  <h2 className="reveal text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-2">Featured Article</h2>
                <div className="section-divider" />
                </div>
                <Card className="reveal-card card-premium overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                  <div className="md:grid md:grid-cols-2">
                    <div className="w-full">
                      <ResponsiveImage
                        src={featuredPost.image || featuredPost.coverImage || featuredPost.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                        alt={featuredPost.featuredImageAltText || featuredPost.title}
                        className="w-full"
                        priority
                        fetchPriority="high"
                        preserveAspect
                        responsiveCloudinary
                        disableHoverZoom
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                    <div className="p-8 flex flex-col justify-center">
                      <Badge className="w-fit mb-4 bg-primary hover:bg-primary/90">
                        {getDisplayCategory(featuredPost)}
                      </Badge>
                      <CardTitle className="text-xl sm:text-2xl mb-4 line-clamp-3">
                        {featuredPost.title}
                      </CardTitle>
                      <CardDescription className="text-base text-[var(--text-secondary)] mb-6 line-clamp-4">
                        {featuredPost.excerpt || featuredPost.description || 'Read practical social media growth strategies and useful content ideas.'}
                      </CardDescription>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                          <AuthorByline post={featuredPost} />
                          <PostDate post={featuredPost} />
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {featuredPost.readingTime || 5} min read
                          </span>
                        </div>
                        <Button asChild variant="default" className="rounded-full">
                          <Link href={`/blog/${featuredPost.slug}`} aria-label={`Read full article: ${featuredPost.title}`}>
                            Read Full Article <ArrowRight className="ml-2 w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </section>
          )}

          {/* Blog Posts Grid/List */}
          <section className="py-8 sm:py-10 bg-[var(--bg-secondary)]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="reveal text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-4">
                  {selectedCategory === 'All' ? 'All Articles' : `${selectedCategory} Articles`}
                  {searchQuery && ` matching "${searchQuery}"`}
                </h2>
                <div className="section-divider" />
                <p className="text-[var(--text-secondary)]">
                  {filteredPosts.length} {filteredPosts.length === 1 ? 'article' : 'articles'} found
                </p>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <Card key={`skeleton-${index}`} className="overflow-hidden">
                      <div className="aspect-video w-full bg-[#f9fafb] dark:bg-[#111118] animate-pulse" />
                      <div className="p-8">
                        <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded mb-2 w-3/4" />
                        <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded mb-4 w-full" />
                        <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded w-2/3" />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-12 sm:py-16">
                  <p className="text-lg text-[var(--text-secondary)] mb-4">No articles found</p>
                  <p className="text-[var(--text-secondary)] mb-8">Try adjusting your search or filter criteria</p>
                  <Button onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }} variant="outline" className="rounded-full">
                    Clear Filters
                  </Button>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {visiblePosts.map((post, index) => (
                    <React.Fragment key={post.slug}>
                      <Card className="reveal-card card-premium overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-105 group">
                      <div className="w-full">
                        <ResponsiveImage
                          src={post.image || post.coverImage || post.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                          alt={post.featuredImageAltText || post.title}
                          className="w-full"
                          // No priority here: only the Featured image above is
                          // the LCP element. This first grid card sits below
                          // the fold (under Featured + the section heading),
                          // so an eager high-priority fetch only competes
                          // with the Featured image on Slow 4G.
                          loading="lazy"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          preserveAspect
                          responsiveCloudinary
                          disableHoverZoom
                        />
                        </div>
                        <CardHeader>
                          <Badge className="w-fit mb-2 bg-primary hover:bg-primary/90">
                            {getDisplayCategory(post)}
                          </Badge>
                          <CardTitle className="text-xl line-clamp-3 group-hover:text-primary transition-colors">
                            {post.title}
                          </CardTitle>
                          <CardDescription className="text-sm text-[var(--text-secondary)]">
                            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                              <AuthorByline post={post} />
                              <PostDate post={post} />
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {post.readingTime || 5} min read
                              </span>
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-[var(--text-secondary)] line-clamp-4">
                            {post.excerpt || post.description || 'Read practical social media growth strategies and useful content ideas.'}
                          </p>
                        </CardContent>
                        <CardFooter>
                          <Button asChild variant="ghost" className="w-full text-primary hover:text-primary hover:bg-primary/10">
                            <Link href={`/blog/${post.slug}`} aria-label={`Read full article: ${post.title}`}>
                              Read Full Article <ArrowRight className="ml-2 w-4 h-4" />
                            </Link>
                          </Button>
                        </CardFooter>
                      </Card>
                    </React.Fragment>
                  ))}
                </div>
              ) : loading ? (
                <div className="max-w-4xl mx-auto space-y-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Card key={`skeleton-list-${index}`} className="overflow-hidden">
                      <div className="md:flex">
                        <div className="md:w-1/3">
                          <div className="h-48 bg-[#f9fafb] dark:bg-[#111118] animate-pulse" />
                        </div>
                        <div className="md:w-2/3 p-6">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded w-20" />
                            <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded w-24" />
                          </div>
                          <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded mb-3 w-full" />
                          <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded mb-4 w-2/3" />
                          <div className="h-4 bg-[#e5e7eb] dark:bg-[#1a1a2e] rounded w-full" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  {visiblePosts.map((post, index) => (
                    <React.Fragment key={post.slug}>
                    <Card key={post.slug} className="reveal-card card-premium hover:shadow-lg transition-all duration-300 hover:border-primary/50">
                      <div className="md:flex">
                        <div className="md:w-1/3">
                        <div className="w-full md:w-auto">
                          <ResponsiveImage
                            src={post.image || post.coverImage || post.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                            alt={post.featuredImageAltText || post.title}
                            className="w-full"
                            // Same as the grid view: only the Featured image
                            // is priority. This card is below the fold.
                            loading="lazy"
                            sizes="(max-width: 768px) 100vw, 33vw"
                            preserveAspect
                            responsiveCloudinary
                            disableHoverZoom
                          />
                          </div>
                        </div>
                        <div className="md:w-2/3 p-6">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <Badge className="bg-primary hover:bg-primary/90">
                              {getDisplayCategory(post)}
                            </Badge>
                            <AuthorByline post={post} className="text-sm text-[var(--text-secondary)]" />
                            <PostDate post={post} className="text-sm text-[var(--text-secondary)]" />
                            <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                              <Clock className="h-3.5 w-3.5" />
                              {post.readingTime || 5} min read
                            </span>
                          </div>
                          <CardTitle className="text-xl mb-3 line-clamp-3 hover:text-primary transition-colors">
                            <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                              {post.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="text-base text-[var(--text-secondary)] mb-4 line-clamp-3">
                            {post.excerpt || post.description || 'Read practical social media growth strategies and useful content ideas.'}
                          </CardDescription>
                          <Button asChild variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10">
                            <Link href={`/blog/${post.slug}`} aria-label={`Read full article: ${post.title}`}>
                              Read Full Article <ArrowRight className="ml-2 w-4 h-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </Card>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Load more: the full list is 34 articles, so only the first
                  page renders up front and the rest loads on demand. */}
              {!loading && gridPosts.length > 0 && (
                <div className="mt-10 text-center">
                  <p className="mb-4 text-sm text-[var(--text-secondary)]">
                    Showing {visiblePosts.length} of {gridPosts.length} articles
                  </p>
                  {hasMorePosts && (
                    <Button
                      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                      variant="outline"
                      size="lg"
                      className="rounded-full"
                    >
                      Load More Articles
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Newsletter: full-width section below the whole list, so it no
              longer breaks the article grid after the 6th card. Placement
              only — the NewsletterSignup component itself is untouched. */}
          <NewsletterSignup variant="inline" />
        </main>

        <BackToTopButton />
        <Footer />
      </div>
    </>
  );
};

export default BlogPage;
