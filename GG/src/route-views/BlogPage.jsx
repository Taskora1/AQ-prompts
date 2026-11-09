'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, ArrowRight, Grid, List, Clock } from 'lucide-react';
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

const BlogPage = ({ initialPosts = [] }) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(
    () => searchParams.get('category') || 'All'
  );
  const [viewMode, setViewMode] = useState('grid');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const posts = initialPosts;
  const loading = false;

  const scrollRevealRef = useScrollReveal();

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))],
    [posts]
  );

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
      const matchCategory = selectedCategory === 'All' || post.category === selectedCategory;
      const q = deferredSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        (post.excerpt || '').toLowerCase().includes(q) ||
        (post.category || '').toLowerCase().includes(q) ||
        (Array.isArray(post.tags) ? post.tags.join(' ').toLowerCase() : '').includes(q);

      return matchCategory && matchSearch;
    });
  }, [deferredSearchQuery, posts, selectedCategory]);

  const featuredPost = filteredPosts[0];
  const showFeaturedSection =
    selectedCategory === 'All' && !deferredSearchQuery.trim() && filteredPosts.length > 0;
  return (
    <>

      <div className="min-h-screen text-[var(--text-primary)]">
        <Header />

        <main>
          {/* Page Hero */}
          <section className="relative bg-white py-12 sm:py-16 dark:bg-[#0a0a0f]">
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
            <section className="py-12 sm:py-16">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8 sm:mb-12">
                  <h2 className="reveal text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-4">Featured Article</h2>
                <div className="section-divider" />
                </div>
                <Card className="reveal-card card-premium overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] max-w-md mx-auto">
                  <div className="w-full">
                    <ResponsiveImage
                      src={featuredPost.image || featuredPost.coverImage || featuredPost.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                      alt={featuredPost.featuredImageAltText || featuredPost.title}
                      className="h-full w-full object-cover"
                      priority
                      fetchPriority="high"
                      preserveAspect
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <div className="p-8">
                      <Badge className="w-fit mb-4 bg-primary hover:bg-primary/90">
                        {featuredPost.category || 'Social Media'}
                      </Badge>
                      <CardTitle className="text-xl mb-4 line-clamp-2">
                        {featuredPost.title}
                      </CardTitle>
                      <CardDescription className="text-base text-[var(--text-secondary)] mb-6 line-clamp-3">
                        {featuredPost.excerpt || featuredPost.description || 'Read practical social media growth strategies and useful content ideas.'}
                      </CardDescription>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                          <span>
                            {formatStableDate(featuredPost.publishDate || featuredPost.date || '2026-03-01')}
                          </span>
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
                </Card>
              </div>
            </section>
          )}

          {/* Blog Posts Grid/List */}
          <section className="py-12 sm:py-16 bg-[var(--bg-secondary)]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8 sm:mb-12">
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
                  {filteredPosts.map((post, index) => (
                    <React.Fragment key={post.slug}>
                      <Card className="reveal-card card-premium overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-105 group">
                      <div className="w-full">
                        <ResponsiveImage
                          src={post.image || post.coverImage || post.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                          alt={post.featuredImageAltText || post.title}
                          className="h-full w-full object-cover"
                          loading={index === 0 ? undefined : 'lazy'}
                          priority={index === 0}
                          fetchPriority={index === 0 ? 'high' : undefined}
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          preserveAspect
                        />
                        </div>
                        <CardHeader>
                          <Badge className="w-fit mb-2 bg-primary hover:bg-primary/90">
                            {post.category || 'Social Media'}
                          </Badge>
                          <CardTitle className="text-xl line-clamp-2 group-hover:text-primary transition-colors">
                            {post.title}
                          </CardTitle>
                          <CardDescription className="text-sm text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-3">
                              <span>{formatStableDate(post.publishDate || post.date || '2026-03-01')}</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {post.readingTime || 5} min read
                              </span>
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-[var(--text-secondary)] line-clamp-3">
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
                      {/* Insert newsletter after every 6th post */}
                      {(index + 1) % 6 === 0 && index < filteredPosts.length - 1 && (
                        <div className="col-span-full">
                          <NewsletterSignup variant="compact" />
                        </div>
                      )}
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
                  {filteredPosts.map((post, index) => (
                    <React.Fragment key={post.slug}>
                    <Card key={post.slug} className="reveal-card card-premium hover:shadow-lg transition-all duration-300 hover:border-primary/50">
                      <div className="md:flex">
                        <div className="md:w-1/3">
                        <div className="aspect-video w-full md:w-auto md:h-full">
                          <ResponsiveImage
                            src={post.image || post.coverImage || post.featuredImage || '/images/prompts/cinematic-sunset-beach-portrait.webp'}
                            alt={post.featuredImageAltText || post.title}
                            className="h-full w-full object-cover"
                            loading={index === 0 ? undefined : 'lazy'}
                            priority={index === 0}
                            fetchPriority={index === 0 ? 'high' : undefined}
                            sizes="(max-width: 768px) 100vw, 33vw"
                          />
                          </div>
                        </div>
                        <div className="md:w-2/3 p-6">
                          <div className="flex items-center gap-2 mb-3">
                            <Badge className="bg-primary hover:bg-primary/90">
                              {post.category || 'Social Media'}
                            </Badge>
                            <span className="text-sm text-[var(--text-secondary)]">
                              {formatStableDate(post.publishDate || post.date || '2026-03-01')}
                            </span>
                            <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                              <Clock className="h-3.5 w-3.5" />
                              {post.readingTime || 5} min read
                            </span>
                          </div>
                          <CardTitle className="text-xl mb-3 line-clamp-2 hover:text-primary transition-colors">
                            <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                              {post.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="text-base text-[var(--text-secondary)] mb-4 line-clamp-2">
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
                    {/* Insert newsletter after every 6th post in list view */}
                    {(index + 1) % 6 === 0 && index < filteredPosts.length - 1 && (
                      <NewsletterSignup variant="compact" />
                    )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Newsletter CTA */}
          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <Card className="max-w-3xl mx-auto bg-[#ff6b35] text-white border-none shadow-2xl">
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl sm:text-3xl text-white mb-4">
                    Stay Updated with Latest Growth Strategies
                  </CardTitle>
                  <CardDescription className="text-white/90 text-base sm:text-lg">
                    Get our best articles delivered directly to your inbox every week
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button asChild size="lg" className="btn-premium bg-white text-primary hover:bg-[#f9fafb] rounded-full">
                    <Link href="/#newsletter">
                      Subscribe to Newsletter <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default BlogPage;
