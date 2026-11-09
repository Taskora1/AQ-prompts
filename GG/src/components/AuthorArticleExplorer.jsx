'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search } from 'lucide-react';

const filters = [
  { id: 'all', label: 'All Articles' },
  { id: 'men', label: 'Male Portraits' },
  { id: 'women', label: 'Women' },
  { id: 'cinematic', label: 'Cinematic' },
];

function matchesFilter(post, filter) {
  if (filter === 'all') return true;

  const searchable = `${post.title} ${post.category} ${post.excerpt}`.toLowerCase();

  if (filter === 'men') return /\b(men|man|male|boy|businessman)\b/.test(searchable);
  if (filter === 'women') return /\b(women|woman|female|girl|fashion)\b/.test(searchable);
  if (filter === 'cinematic') return /\b(cinematic|cinema|editorial|luxury|dramatic)\b/.test(searchable);
  return true;
}

export default function AuthorArticleExplorer({ posts, featuredSlug }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesQuery = !normalizedQuery
        || `${post.title} ${post.category} ${post.excerpt}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && matchesFilter(post, activeFilter);
    });
  }, [activeFilter, posts, query]);

  return (
    <div className="mt-7">
      <div className="card-premium rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm dark:bg-[#111118] sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <label htmlFor="author-article-search" className="sr-only">Search Abdul Qudoos articles</label>
          <input
            id="author-article-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles and prompt guides"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm text-slate-950 outline-none transition focus:border-[#ff6b35] focus:ring-2 focus:ring-[#ff6b35]/30 dark:border-white/20 dark:bg-[#0a0a0f] dark:text-white"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter articles by topic">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveFilter(filter.id)}
                className={`min-h-10 rounded-full px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-[#ff6b35] text-slate-950 shadow-sm'
                    : 'border border-slate-300 bg-white text-slate-700 hover:border-[#ff6b35] hover:text-[#b83a0b] dark:border-white/20 dark:bg-[#0a0a0f] dark:text-slate-200 dark:hover:text-[#ff8a5c]'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
        Showing {visiblePosts.length} {visiblePosts.length === 1 ? 'article' : 'articles'}
      </p>

      {visiblePosts.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          {visiblePosts.map((post) => (
            <article
              key={post.slug}
              className="card-premium group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#ff6b35]/70 hover:shadow-lg focus-within:border-[#ff6b35] focus-within:shadow-lg dark:bg-[#111118] dark:hover:border-[#ff8a5c]/70"
            >
              {post.coverImage && (
                <div className="relative overflow-hidden border-b border-slate-100 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                  <Image
                    src={post.coverImage}
                    alt={post.coverImageAlt || `${post.title} article cover`}
                    width={720}
                    height={405}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    loading="lazy"
                    className="aspect-video h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {post.slug === featuredSlug && (
                    <span className="absolute left-4 top-4 rounded-full bg-[#ff6b35] px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-slate-950 shadow-md">
                      Editor&apos;s Pick
                    </span>
                  )}
                </div>
              )}
              <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b83a0b] dark:text-[#ff8a5c]">{post.category}</p>
                <h3 className="mt-2 text-xl font-black leading-snug">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="rounded-sm transition-colors hover:text-[#b83a0b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-4 dark:hover:text-[#ff8a5c]"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{post.excerpt}</p>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                  Published {post.publishDate}{post.updatedAt && post.updatedAt !== post.publishDate ? ` · Updated ${post.updatedAt}` : ''}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-white/20">
          <p className="font-bold text-slate-900 dark:text-white">No matching articles found.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveFilter('all');
            }}
            className="mt-3 rounded-full border border-[#ff6b35] px-4 py-2 text-sm font-bold text-[#b83a0b] hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] dark:text-[#ff8a5c] dark:hover:bg-white/5"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
