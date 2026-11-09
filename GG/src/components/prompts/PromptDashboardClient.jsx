'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Eye,
  Heart,
  Copy,
  LoaderCircle,
  RefreshCw,
  Star,
  Trophy,
  Filter,
  ChevronDown,
  ExternalLink,
  Search,
  Flame,
  TrendingUp,
  Clock,
  BarChart3,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildRankingMap(sortedPrompts) {
  const map = {};
  sortedPrompts.forEach((p, i) => { map[p.id || p.slug] = i + 1; });
  return map;
}

function sendNotification(title, body, url) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: url || title });
    if (url) n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

/* ── Sub-components ───────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, subtext, color = '#ff6b35' }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-[#111118]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15`, color }}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] dark:text-[#9ca3af]">{label}</p>
          <p className="text-2xl font-black text-[#111118] dark:text-white">{value}</p>
          {subtext && <p className="mt-0.5 truncate text-xs text-[#9ca3af]">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className={`rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-[#111118]`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: bg, color }}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">{label}</p>
          <p className="truncate text-sm font-bold text-[#111118] dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function RankBadge({ rank }) {
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${rank <= 3 ? 'bg-[#ff6b35] text-white shadow-[0_4px_12px_rgba(255,107,53,0.3)]' : 'bg-[#f3f4f6] text-[#6b7280] dark:bg-white/10 dark:text-[#9ca3af]'}`}>
      {rank}
    </span>
  );
}

function CategoryBar({ category, value, maxVal }) {
  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm font-medium text-[#4b5563] dark:text-[#cbd5e1] sm:w-40">{category}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[#f3f4f6] dark:bg-white/5">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ff6b35] to-[#ff9a73] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-sm font-bold text-[#111118] dark:text-white">{formatNumber(value)}</span>
    </div>
  );
}

function PromptMiniCard({ prompt, rank, prefix }) {
  const url = `/tools/ai-image-prompts/p/${prompt.slug}`;
  return (
    <div className="group overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#111118]">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f3f4f6] dark:bg-white/5">
        <img src={prompt.image} alt={prompt.imageAlt || prompt.imageAltTexts?.['0'] || prompt.imageAltTexts?.[0] || prompt.title} width={800} height={1000} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        {rank && (
          <span className="absolute left-2.5 top-2.5 z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#ff6b35] px-2 text-[11px] font-black text-white shadow-lg">
            {prefix || ''}#{rank}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <span className="inline-block rounded-full bg-[#ff6b3515] px-2 py-0.5 text-[10px] font-bold text-[#c2410c]">{prompt.category}</span>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-[#111118] transition group-hover:text-[#c2410c] dark:text-white">{prompt.title}</h3>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[#6b7280] dark:text-[#9ca3af]">
          <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" /> {formatNumber(prompt.stats?.copies || 0)}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNumber(prompt.stats?.views || 0)}</span>
          <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {formatNumber(prompt.stats?.likes || 0)}</span>
        </div>
        <Link href={url} className="mt-3 flex h-9 w-full items-center justify-center rounded-full bg-[#ff6b35] text-xs font-bold text-white transition hover:bg-[#e85a2e]">
          View Prompt <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-[#e5e7eb] bg-white p-5 dark:border-white/10 dark:bg-[#111118]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-white/10" />
              <div className="space-y-2"><div className="h-3 w-20 rounded bg-gray-200 dark:bg-white/10" /><div className="h-6 w-12 rounded bg-gray-200 dark:bg-white/10" /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-[#e5e7eb] bg-white dark:border-white/10 dark:bg-[#111118]">
            <div className="aspect-[4/5] bg-gray-200 dark:bg-white/10" />
            <div className="p-4 space-y-2"><div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10" /><div className="h-5 w-full rounded bg-gray-200 dark:bg-white/10" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Constants ────────────────────────────────────────────────────── */

const REFRESH_MS = 30_000;
const SORT_OPTIONS = [
  { key: 'copies', label: 'Most Copies' },
  { key: 'views', label: 'Most Views' },
  { key: 'likes', label: 'Most Likes' },
  { key: 'rating', label: 'Highest Rating' },
];
const CAT_SORT_OPTIONS = [
  { key: 'copies', label: 'By Copies' },
  { key: 'views', label: 'By Views' },
  { key: 'likes', label: 'By Likes' },
];

/* ── Main Component ───────────────────────────────────────────────── */

export default function PromptDashboardClient() {
  const [prompts, setPrompts] = useState([]);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('copies');
  const [sortOpen, setSortOpen] = useState(false);
  const [catSortBy, setCatSortBy] = useState('copies');
  const [catSortOpen, setCatSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef(null);

  /* ── Fetch ────────────────────────────────────────────────────── */

  const fetchPrompts = useCallback((isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    fetch('/api/prompts/trending', { headers: { Accept: 'application/json' } })
      .then(async (r) => { const p = await r.json(); if (!r.ok) throw new Error(p.error || 'Unable to load data.'); return p; })
      .then((p) => {
        setPrompts(p.prompts || []);
        setUnavailable(Boolean(p.unavailable));
        if (p.unavailable) setAutoRefresh(false);
        setLastRefreshed(new Date());
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { fetchPrompts(true); }, [fetchPrompts]);
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) intervalRef.current = setInterval(() => fetchPrompts(false), REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchPrompts]);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30_000); return () => clearInterval(id); }, []);

  /* ── Hooks (must be before early returns) ─────────────────────── */

  const query = searchQuery.trim().toLowerCase();

  const filteredPrompts = useMemo(() => {
    if (!query) return prompts;
    return prompts.filter((p) => (p.title || '').toLowerCase().includes(query) || (p.category || '').toLowerCase().includes(query));
  }, [prompts, query]);

  const sortedPrompts = useMemo(() => {
    return [...filteredPrompts].sort((a, b) => {
      const as = a.stats || {}, bs = b.stats || {};
      if (sortBy === 'views') return (bs.views || 0) - (as.views || 0);
      if (sortBy === 'likes') return (bs.likes || 0) - (as.likes || 0);
      if (sortBy === 'rating') return (bs.avgRating || 0) - (as.avgRating || 0) || (bs.ratingCount || 0) - (as.ratingCount || 0);
      return (bs.copies || 0) - (as.copies || 0);
    });
  }, [filteredPrompts, sortBy]);

  /* Computed data */
  const totalPrompts = prompts.length;
  const totalCopies = prompts.reduce((s, p) => s + (p.stats?.copies || 0), 0);
  const totalViews = prompts.reduce((s, p) => s + (p.stats?.views || 0), 0);
  const totalLikes = prompts.reduce((s, p) => s + (p.stats?.likes || 0), 0);
  const ratedPrompts = prompts.filter((p) => (p.stats?.ratingCount || 0) > 0);
  const avgRating = ratedPrompts.length > 0 ? ratedPrompts.reduce((s, p) => s + (p.stats?.avgRating || 0), 0) / ratedPrompts.length : 0;

  /* Category aggregation */
  const categoryMap = {};
  for (const p of prompts) {
    const cat = p.category || 'Uncategorized';
    if (!categoryMap[cat]) categoryMap[cat] = { copies: 0, views: 0, likes: 0, count: 0 };
    categoryMap[cat].copies += p.stats?.copies || 0;
    categoryMap[cat].views += p.stats?.views || 0;
    categoryMap[cat].likes += p.stats?.likes || 0;
    categoryMap[cat].count += 1;
  }
  const categoryEntries = Object.entries(categoryMap).sort((a, b) => {
    if (catSortBy === 'views') return b[1].views - a[1].views;
    if (catSortBy === 'likes') return b[1].likes - a[1].likes;
    return b[1].copies - a[1].copies;
  });
  const catMaxVal = Math.max(1, ...categoryEntries.map(([, v]) => catSortBy === 'views' ? v.views : catSortBy === 'likes' ? v.likes : v.copies));

  /* Derived lists */
  const trending = useMemo(() => {
    return [...prompts].sort((a, b) => {
      const aS = a.stats || {}, bS = b.stats || {};
      const aScore = (aS.copies || 0) * 2 + (aS.likes || 0) * 3 + (aS.views || 0) * 0.5;
      const bScore = (bS.copies || 0) * 2 + (bS.likes || 0) * 3 + (bS.views || 0) * 0.5;
      return bScore - aScore;
    }).slice(0, 3);
  }, [prompts]);

  const mostLoved = useMemo(() => {
    return [...prompts].sort((a, b) => (b.stats?.likes || 0) - (a.stats?.likes || 0)).slice(0, 3);
  }, [prompts]);

  const recentlyAdded = useMemo(() => {
    return [...prompts].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    }).slice(0, 3);
  }, [prompts]);

  const topCategory = categoryEntries.length > 0 ? categoryEntries[0][0] : '—';
  const mostCopied = sortedPrompts.length > 0 ? sortedPrompts[0] : null;
  const highestRated = ratedPrompts.length > 0 ? [...ratedPrompts].sort((a, b) => (b.stats?.avgRating || 0) - (a.stats?.avgRating || 0))[0] : null;

  /* ── Loading / Error ──────────────────────────────────────────── */

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center dark:border-red-500/20 dark:bg-red-500/5">
        <p className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>
        <button onClick={() => { setLoading(true); setError(''); fetchPrompts(true); }} className="mt-4 rounded-full bg-[#ff6b35] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#e85a2e]">Try again</button>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
          Engagement statistics are unavailable in this Preview.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Refresh Bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-[#6b7280] dark:text-[#9ca3af]">
          {lastRefreshed && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Updated {formatTimeAgo(lastRefreshed)}</span>
              {autoRefresh && <span className="text-xs text-[#9ca3af]">· auto {REFRESH_MS / 1000}s</span>}
            </>
          )}
        </div>
        {unavailable ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-secondary)]">
            Engagement statistics are unavailable in this Preview.
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh((p) => !p)} disabled={unavailable} className={autoRefresh ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400' : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-gray-100 text-[#6b7280] dark:bg-white/5 dark:text-[#9ca3af]'}>
            <div className={autoRefresh ? 'h-1.5 w-1.5 rounded-full bg-green-500' : 'h-1.5 w-1.5 rounded-full bg-gray-400'} />
            <span className="hidden sm:inline">{autoRefresh ? 'Auto ON' : 'Auto OFF'}</span>
          </button>
          <button onClick={() => fetchPrompts(false)} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b5563] transition hover:border-[#ff6b35] hover:text-[#c2410c] disabled:opacity-50 dark:border-white/10 dark:bg-[#1a1a2e] dark:text-[#cbd5e1]">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Copy} label="Total Copies" value={formatNumber(totalCopies)} subtext={`Across ${totalPrompts} prompts`} color="#ff6b35" />
        <KpiCard icon={Eye} label="Total Views" value={formatNumber(totalViews)} subtext="Page impressions" color="#3b82f6" />
        <KpiCard icon={Heart} label="Total Likes" value={formatNumber(totalLikes)} subtext="User favorites" color="#ef4444" />
        <KpiCard icon={Star} label="Avg Rating" value={avgRating > 0 ? avgRating.toFixed(1) : '—'} subtext={`${ratedPrompts.length} rated`} color="#f59e0b" />
      </div>

      {/* ── Quick Insights ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-black text-[#111118] dark:text-white">Quick Insights</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <InsightCard icon={Flame} label="Most Copied" value={mostCopied ? mostCopied.title : '—'} color="#ff6b35" bg="#ff6b3515" />
          <InsightCard icon={Star} label="Highest Rated" value={highestRated ? `${highestRated.title} (${highestRated.stats.avgRating.toFixed(1)})` : '—'} color="#f59e0b" bg="#f59e0b15" />
          <InsightCard icon={Trophy} label="Top Category" value={topCategory} color="#8b5cf6" bg="#8b5cf615" />
        </div>
      </div>

      {/* ── Category Performance ────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#c2410c]" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Category Performance</h2>
          </div>
          <div className="relative">
            <button onClick={() => setCatSortOpen(!catSortOpen)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b5563] transition hover:border-[#ff6b35] dark:border-white/10 dark:bg-[#1a1a2e] dark:text-[#cbd5e1]">
              <Filter className="h-3 w-3" />
              {CAT_SORT_OPTIONS.find((o) => o.key === catSortBy)?.label}
              <ChevronDown className={`h-3 w-3 transition ${catSortOpen ? 'rotate-180' : ''}`} />
            </button>
            {catSortOpen && (
              <div className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-xl dark:border-white/10 dark:bg-[#1a1a2e]">
                {CAT_SORT_OPTIONS.map((o) => (
                  <button key={o.key} onClick={() => { setCatSortBy(o.key); setCatSortOpen(false); }} className={`block w-full px-4 py-2 text-left text-xs font-medium transition hover:bg-[#fff8f5] dark:hover:bg-white/5 ${catSortBy === o.key ? 'text-[#c2410c]' : 'text-[#4b5563] dark:text-[#cbd5e1]'}`}>{o.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {categoryEntries.map(([cat, data]) => {
            const val = catSortBy === 'views' ? data.views : catSortBy === 'likes' ? data.likes : data.copies;
            return <CategoryBar key={cat} category={cat} value={val} maxVal={catMaxVal} />;
          })}
        </div>
        <p className="mt-4 text-xs text-[#9ca3af]">{categoryEntries.length} categories · {totalPrompts} prompts</p>
      </div>

      {/* ── Trending Prompts ────────────────────────────────────── */}
      {trending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Flame className="h-5 w-5 text-[#c2410c]" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Trending Prompts</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trending.map((p, i) => <PromptMiniCard key={p.id || p.slug} prompt={p} rank={i + 1} prefix="🔥" />)}
          </div>
        </div>
      )}

      {/* ── Prompt Ranking ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm dark:border-white/10 dark:bg-[#111118]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f3f4f6] p-5 sm:p-6 dark:border-white/5">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-[#c2410c]" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Prompt Ranking</h2>
            <span className="rounded-full bg-[#ff6b3515] px-2.5 py-0.5 text-[10px] font-bold text-[#c2410c]">{sortedPrompts.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search prompts…" className="h-9 w-full rounded-full border border-[#e5e7eb] bg-white pl-9 pr-4 text-xs font-medium text-[#111118] placeholder:text-[#9ca3af] transition focus:border-[#ff6b35] focus:outline-none focus:ring-1 focus:ring-[#ff6b35]/30 dark:border-white/10 dark:bg-[#1a1a2e] dark:text-white sm:w-44" />
            </div>
            <div className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b5563] transition hover:border-[#ff6b35] dark:border-white/10 dark:bg-[#1a1a2e] dark:text-[#cbd5e1]">
                <Filter className="h-3 w-3" />
                {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
                <ChevronDown className={`h-3 w-3 transition ${sortOpen ? 'rotate-180' : ''}`} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-xl dark:border-white/10 dark:bg-[#1a1a2e]">
                  {SORT_OPTIONS.map((o) => (
                    <button key={o.key} onClick={() => { setSortBy(o.key); setSortOpen(false); }} className={`block w-full px-4 py-2.5 text-left text-sm font-medium transition hover:bg-[#fff8f5] dark:hover:bg-white/5 ${sortBy === o.key ? 'text-[#c2410c]' : 'text-[#4b5563] dark:text-[#cbd5e1]'}`}>{o.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {sortedPrompts.length === 0 ? (
          <div className="p-10 text-center"><p className="text-sm font-medium text-[#9ca3af]">{query ? `No prompts match "${searchQuery}"` : 'No prompt data available.'}</p></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#f3f4f6] text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af] dark:border-white/5">
                    <th className="px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Prompt</th>
                    <th className="px-4 py-3 text-center">Copies</th>
                    <th className="px-4 py-3 text-center">Views</th>
                    <th className="px-4 py-3 text-center">Likes</th>
                    <th className="px-4 py-3 text-center">Rating</th>
                    <th className="px-4 py-3 text-center">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPrompts.map((p, i) => (
                    <tr key={p.id || p.slug} className="group border-b border-[#f3f4f6] transition hover:bg-[#fff8f5] dark:border-white/5 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-center"><RankBadge rank={i + 1} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={p.image} alt={p.imageAlt || p.imageAltTexts?.['0'] || p.imageAltTexts?.[0] || p.title || ''} width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                          <div className="min-w-0">
                            <Link href={`/tools/ai-image-prompts/p/${p.slug}`} className="block truncate text-sm font-bold text-[#111118] transition group-hover:text-[#c2410c] dark:text-white">{p.title}</Link>
                            <span className="mt-0.5 inline-block rounded-full bg-[#ff6b3515] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">{p.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-sm font-bold text-[#111118] dark:text-white">{formatNumber(p.stats?.copies || 0)}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-sm text-[#4b5563] dark:text-[#cbd5e1]">{formatNumber(p.stats?.views || 0)}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-sm text-[#4b5563] dark:text-[#cbd5e1]">{formatNumber(p.stats?.likes || 0)}</span></td>
                      <td className="px-4 py-3 text-center">
                        {(p.stats?.ratingCount || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500"><Star className="h-3.5 w-3.5 fill-amber-400" />{p.stats.avgRating.toFixed(1)}</span>
                        ) : <span className="text-xs text-[#d1d5db]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/tools/ai-image-prompts/p/${p.slug}`} className="inline-flex items-center gap-1 rounded-full bg-[#ff6b3515] px-3 py-1 text-xs font-semibold text-[#c2410c] transition hover:bg-[#ff6b35] hover:text-white">View <ExternalLink className="h-3 w-3" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="space-y-3 p-4 md:hidden">
              {sortedPrompts.map((p, i) => (
                <div key={p.id || p.slug} className="rounded-xl border border-[#f3f4f6] bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111118]">
                  <div className="flex items-start gap-3">
                    <RankBadge rank={i + 1} />
                    <img src={p.image} alt={p.imageAlt || p.imageAltTexts?.['0'] || p.imageAltTexts?.[0] || p.title || ''} width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/tools/ai-image-prompts/p/${p.slug}`} className="block truncate text-sm font-bold text-[#111118] dark:text-white">{p.title}</Link>
                      <span className="mt-0.5 inline-block rounded-full bg-[#ff6b3515] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">{p.category}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
                    <div><p className="text-[#9ca3af]">Copies</p><p className="font-bold text-[#111118] dark:text-white">{formatNumber(p.stats?.copies || 0)}</p></div>
                    <div><p className="text-[#9ca3af]">Views</p><p className="font-bold text-[#111118] dark:text-white">{formatNumber(p.stats?.views || 0)}</p></div>
                    <div><p className="text-[#9ca3af]">Likes</p><p className="font-bold text-[#111118] dark:text-white">{formatNumber(p.stats?.likes || 0)}</p></div>
                    <div><p className="text-[#9ca3af]">Rating</p><p className="font-bold text-amber-500">{(p.stats?.ratingCount || 0) > 0 ? p.stats.avgRating.toFixed(1) : '—'}</p></div>
                  </div>
                  <Link href={`/tools/ai-image-prompts/p/${p.slug}`} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#ff6b35] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e85a2e]">View Prompt <ExternalLink className="h-3 w-3" /></Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Top Performers ──────────────────────────────────────── */}
      {sortedPrompts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-[#c2410c]" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Top Performers</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedPrompts.slice(0, 3).map((p, i) => <PromptMiniCard key={p.id || p.slug} prompt={p} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* ── Most Loved ──────────────────────────────────────────── */}
      {mostLoved.length > 0 && mostLoved[0]?.stats?.likes > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Most Loved</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mostLoved.map((p, i) => <PromptMiniCard key={p.id || p.slug} prompt={p} rank={i + 1} prefix="❤️" />)}
          </div>
        </div>
      )}

      {/* ── Recently Added ──────────────────────────────────────── */}
      {recentlyAdded.length > 0 && recentlyAdded[0]?.createdAt && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-black text-[#111118] dark:text-white">Recently Added</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyAdded.map((p, i) => (
              <div key={p.id || p.slug} className="group overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#111118]">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f3f4f6] dark:bg-white/5">
                  <img src={p.image} alt={p.imageAlt || p.imageAltTexts?.['0'] || p.imageAltTexts?.[0] || p.title} width={800} height={1000} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  <span className="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                    <Clock className="h-3 w-3" />{formatDate(p.createdAt)}
                  </span>
                </div>
                <div className="p-3.5">
                  <span className="inline-block rounded-full bg-[#ff6b3515] px-2 py-0.5 text-[10px] font-bold text-[#c2410c]">{p.category}</span>
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-[#111118] transition group-hover:text-[#c2410c] dark:text-white">{p.title}</h3>
                  <Link href={`/tools/ai-image-prompts/p/${p.slug}`} className="mt-3 flex h-9 w-full items-center justify-center rounded-full bg-[#ff6b35] text-xs font-bold text-white transition hover:bg-[#e85a2e]">View Prompt <ExternalLink className="ml-1 h-3 w-3" /></Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#ff6b35]/20 bg-gradient-to-br from-[#fff4ef] to-[#fff8f5] p-8 text-center dark:border-[#ff6b35]/10 dark:from-[#1b1514] dark:to-[#111118]">
        <h2 className="text-xl font-black text-[#111118] dark:text-white">Explore All Prompts</h2>
        <p className="mt-2 text-sm text-[#6b7280] dark:text-[#9ca3af]">Discover the full collection of AI image prompts for creators.</p>
        <Link href="/tools/ai-image-prompts" className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-[#ff6b35] px-8 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:bg-[#e85a2e] hover:shadow-xl">
          View All Prompts <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
