'use client';

import { Fragment } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import PromptFeedCard from '@/components/home/PromptFeedCard';
import { getPromptUrl, PROMPT_CATEGORIES } from '@/lib/prompt-constants';

const SEARCH_DEBOUNCE_MS = 300;
const SURPRISE_API = '/api/prompts/page?random=1';
const PROMPT_LISTING_IMAGE_SIZES = '(max-width: 639px) calc(50vw - 20px), (max-width: 767px) calc(50vw - 30px), (max-width: 1023px) calc(25vw - 21px), (max-width: 1279px) calc(25vw - 28px), 292px';

export default function PromptListingClient({
  prompts = [],
  activeCategory = null,
  initialVisibleCount = prompts.length,
  totalCount = prompts.length,
  enableSort = false,
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [serverPages, setServerPages] = useState(null); // null = not started
  const [serverTotal, setServerTotal] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState(null); // null = no active fetch
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState('latest');
  const [sortError, setSortError] = useState('');
  const [sortFailedPage, setSortFailedPage] = useState(1);
  const loadMoreStartedRef = useRef(false);
  const sortSeedRef = useRef(null);
  const sortRequestIdRef = useRef(0);

  const requestSortedPage = useCallback(async (page, sort, seed) => {
    const requestId = ++sortRequestIdRef.current;
    setSortError('');
    setIsLoadingMore(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(initialVisibleCount),
      sort,
    });
    if (activeCategory) params.set('category', activeCategory);
    if (sort === 'random') params.set('seed', String(seed));

    try {
      const response = await fetch(`/api/prompts/page?${params}`, {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load prompts.');
      if (requestId !== sortRequestIdRef.current) return;

      // Adopt the seed the server used (it generates one when sort=random is
      // requested without a seed), so retries and "Load more" page with the
      // same shuffle instead of drifting to a different order.
      if (sort === 'random' && Number.isSafeInteger(payload.seed)) {
        sortSeedRef.current = payload.seed;
      }

      setServerPages((current) => ({
        page,
        items: page === 1
          ? payload.prompts || []
          : [...(current?.items || []), ...(payload.prompts || [])],
        hasMore: payload.hasMore,
      }));
      setServerTotal(payload.totalCount);
      setVisibleCount((current) => (page === 1 ? payload.prompts?.length || 0 : current + initialVisibleCount));
    } catch (error) {
      if (requestId === sortRequestIdRef.current) {
        setSortError(error instanceof Error ? error.message : 'Unable to load prompts.');
        setSortFailedPage(page);
      }
      if (requestId === sortRequestIdRef.current && page === 1) {
        setServerPages(null);
        setServerTotal(null);
      }
    } finally {
      if (requestId === sortRequestIdRef.current) setIsLoadingMore(false);
    }
  }, [activeCategory, initialVisibleCount]);

  useEffect(() => {
    if (!enableSort) return undefined;
    sortSeedRef.current = null;
    requestSortedPage(1, 'latest', null);
    return () => {
      sortRequestIdRef.current += 1;
    };
  }, [enableSort, requestSortedPage]);

  const handleSortChange = (event) => {
    const nextSort = event.target.value;
    setSortBy(nextSort);
    setServerPages(null);
    setServerTotal(null);
    setVisibleCount(initialVisibleCount);
    loadMoreStartedRef.current = false;
    const seed = nextSort === 'random'
      ? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      : null;
    sortSeedRef.current = seed;
    requestSortedPage(1, nextSort, seed);
  };

  const normalizedSearch = searchTerm.trim();

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q');
    if (initialQuery) setSearchTerm(initialQuery);
  }, []);

  // Debounce search input before hitting the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(normalizedSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedSearch]);

  // Server-backed search (replaces shipping the full dataset for client filtering).
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults(null);
      return undefined;
    }

    let cancelled = false;
    setIsSearching(true);
    fetch(`/api/prompts/search?q=${encodeURIComponent(debouncedSearch)}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Search failed.');
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setSearchResults(payload.results || []);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Lazily fetch additional pages from the paginated API when the user
  // exhausts the server-rendered initial slice.
  const canLoadMore = !debouncedSearch
    && (!enableSort || serverPages !== null)
    && (serverTotal === null ? visibleCount < totalCount : Boolean(serverPages && serverPages.hasMore));

  const handleLoadMore = () => {
    if (isLoadingMore) return;

    if (serverPages === null) {
      // First "Load more": page 1 of the API overlaps the initial server slice,
      // so skip straight to page 2.
      if (loadMoreStartedRef.current) return;
      loadMoreStartedRef.current = true;
      setIsLoadingMore(true);
      if (enableSort) {
        requestSortedPage(2, sortBy, sortSeedRef.current);
        return;
      }
      const categoryParam = activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : '';
      fetch(`/api/prompts/page?page=2&pageSize=${initialVisibleCount}${categoryParam}`, { headers: { Accept: 'application/json' } })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'Unable to load prompts.');
          return payload;
        })
        .then((payload) => {
          setServerPages({ page: 2, items: payload.prompts || [], hasMore: payload.hasMore });
          setServerTotal(payload.totalCount);
          setVisibleCount((count) => count + initialVisibleCount);
        })
        .catch(() => {
          // Keep the local slice; the button stays for a retry.
          loadMoreStartedRef.current = false;
        })
        .finally(() => {
          setIsLoadingMore(false);
        });
      return;
    }

    const nextPage = serverPages.page + 1;
    if (enableSort) {
      requestSortedPage(nextPage, sortBy, sortSeedRef.current);
      return;
    }
    setIsLoadingMore(true);
    const categoryParam = activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : '';
    fetch(`/api/prompts/page?page=${nextPage}&pageSize=${initialVisibleCount}${categoryParam}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load prompts.');
        return payload;
      })
      .then((payload) => {
        setServerPages((current) => ({
          page: nextPage,
          items: [...(current?.items || []), ...(payload.prompts || [])],
          hasMore: payload.hasMore,
        }));
        setServerTotal(payload.totalCount);
        setVisibleCount((count) => count + initialVisibleCount);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingMore(false);
      });
  };

  // "Surprise me" asks the server to pick a random prompt (no full dataset shipped).
  const handleSurprise = () => {
    fetch(SURPRISE_API, { headers: { Accept: 'application/json' } })
      .then((response) => response.json())
      .then((payload) => {
        const [prompt] = payload.prompts || [];
        if (prompt) router.push(getPromptUrl(prompt));
      })
      .catch(() => {});
  };

  const visiblePrompts = useMemo(() => {
    if (debouncedSearch) return searchResults || [];
    if (enableSort && serverPages !== null) return serverPages.items || [];
    const localSlice = prompts.slice(0, visibleCount);
    if (serverPages?.items?.length) {
      const seen = new Set(localSlice.map((prompt) => prompt.slug));
      const extra = serverPages.items.filter((prompt) => !seen.has(prompt.slug));
      return [...localSlice, ...extra];
    }
    return localSlice;
  }, [debouncedSearch, searchResults, prompts, visibleCount, serverPages, enableSort]);

  const displayedTotal = debouncedSearch
    ? (searchResults || []).length
    : serverTotal !== null
      ? serverTotal
      : Math.max(totalCount, prompts.length);

  return (
    <section id="prompts" className="overflow-hidden bg-[var(--bg-secondary)] py-6 sm:py-8">
      <div className="mx-auto min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              aria-label="Search prompts"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search prompts, styles, tags..."
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-12 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[#ff6b35] focus-visible:ring-2 focus-visible:ring-[#ff6b35]/20"
            />
            <button
              type="button"
              onClick={handleSurprise}
              aria-label="Surprise me with a random prompt"
              title="Surprise me"
              className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#ff6b35] transition-colors hover:bg-[#ff6b35]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]"
            >
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {enableSort ? (
            <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              Sort
              <select
                aria-label="Sort prompts"
                value={sortBy}
                onChange={handleSortChange}
                className="h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[#ff6b35] focus-visible:ring-2 focus-visible:ring-[#ff6b35]/20"
              >
                <option value="latest">Latest</option>
                <option value="random">Random</option>
              </select>
            </label>
          ) : null}
        </div>

        {!activeCategory && (
          <nav className="-mx-4 mt-5 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:mt-6 sm:px-0" aria-label="Prompt categories">
            <Link href="/tools/ai-image-prompts" className="shrink-0 snap-start whitespace-nowrap rounded-full bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-[#111118]">
              All
            </Link>
            {Object.values(PROMPT_CATEGORIES).map((category) => (
              <Link
                key={category.slug}
                href={`/tools/ai-image-prompts/${category.slug}`}
                className="shrink-0 snap-start whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#ff6b35] hover:bg-[#ff6b35]/5"
              >
                {category.label}
              </Link>
            ))}
          </nav>
        )}

        {enableSort && sortError ? (
          <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" role="alert">
            {sortError}
            <button
              type="button"
              onClick={() => requestSortedPage(sortFailedPage, sortBy, sortSeedRef.current)}
              className="font-semibold text-[#c2410c] underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        ) : null}

        {!debouncedSearch ? (
          <div className="mt-6 grid min-w-0 grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:gap-4">
            {visiblePrompts.map((prompt, index) => (
              <Fragment key={prompt.slug}>
                <PromptFeedCard
                  promptId={prompt.id}
                  title={prompt.title || ''}
                  image={prompt.image || prompt.images?.[0] || '/images/placeholder.webp'}
                  imageAlt={prompt.imageAlt || prompt.title || ''}
                  slug={prompt.slug || ''}
                  promptText={prompt.prompt || ''}
                  sizes={PROMPT_LISTING_IMAGE_SIZES}
                  showSave
                  mobileTitleBelow
                  uniformAspectRatio
                  priority={index === 0}
                />
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="mt-6 min-w-0 sm:mt-8">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Search results for &quot;{normalizedSearch}&quot;
              {isSearching ? ' — searching…' : ''}
            </p>
            <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:gap-4">
              {visiblePrompts.map((prompt) => (
                <PromptFeedCard
                  key={prompt.slug}
                  promptId={prompt.id}
                  title={prompt.title || ''}
                  image={prompt.image || prompt.images?.[0] || '/images/placeholder.webp'}
                  imageAlt={prompt.imageAlt || prompt.title || ''}
                  slug={prompt.slug || ''}
                  promptText={prompt.prompt || ''}
                  sizes={PROMPT_LISTING_IMAGE_SIZES}
                  showSave
                  mobileTitleBelow
                  uniformAspectRatio
                />
              ))}
            </div>
          </div>
        )}

        {((debouncedSearch && !isSearching && visiblePrompts.length === 0) || (!debouncedSearch && visiblePrompts.length === 0)) && (
          <div className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
            <p className="font-semibold text-[var(--text-primary)]">No prompts found</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Try a different search term or browse another category.</p>
          </div>
        )}

        {canLoadMore && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Showing {visiblePrompts.length} of {displayedTotal} prompts
            </p>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#ff6b35] px-6 text-sm font-semibold text-[#111118] transition-colors hover:bg-[#f45f29] disabled:opacity-60 sm:w-auto"
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
