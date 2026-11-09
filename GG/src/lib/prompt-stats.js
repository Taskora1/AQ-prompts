export const STAT_TYPES = ['views', 'likes', 'copies'];
export const TRENDING_STAT_TYPES = ['views', 'likes', 'copies', 'ratingSum', 'ratingCount'];
export const TRENDING_WINDOW_DAYS = 7;
const DAILY_STATS_TTL_SECONDS = 10 * 24 * 60 * 60;

export function normalizePromptId(id = '') {
  return decodeURIComponent(String(id)).trim();
}

export function getPromptId(prompt = {}) {
  return normalizePromptId(prompt.slug || prompt.id || prompt.title);
}

export function getPromptStatKey(id, type) {
  return `prompt:${normalizePromptId(id)}:${type}`;
}

export function getPromptLikeSetKey(id) {
  return `prompt:${normalizePromptId(id)}:likedBy`;
}

export function getPromptRatingSumKey(id) {
  return `prompt:rating:sum:${normalizePromptId(id)}`;
}

export function getPromptRatingCountKey(id) {
  return `prompt:rating:count:${normalizePromptId(id)}`;
}

export function getPromptRatingUserVotesKey(id) {
  return `prompt:rating:userVotes:${normalizePromptId(id)}`;
}

export function getUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getRecentDateKeys(days = TRENDING_WINDOW_DAYS, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index);
    return getUtcDateKey(date);
  });
}

export function getPromptDailyStatsKey(dateKey, type) {
  return `prompt:daily:${dateKey}:${type}`;
}

export function getPromptDailyUniqueKey(id, action, dateKey = getUtcDateKey()) {
  return `prompt:daily:${dateKey}:${action}:unique:${normalizePromptId(id)}`;
}

export async function incrementPromptDailyStat(kv, id, type, amount = 1, dateKey = getUtcDateKey()) {
  const key = getPromptDailyStatsKey(dateKey, type);
  const value = await kv.hincrby(key, normalizePromptId(id), amount);
  await kv.expire(key, DAILY_STATS_TTL_SECONDS);
  return value;
}

export async function markPromptDailyUnique(kv, id, action, userId, dateKey = getUtcDateKey()) {
  const key = getPromptDailyUniqueKey(id, action, dateKey);
  const added = await kv.sadd(key, userId);
  await kv.expire(key, DAILY_STATS_TTL_SECONDS);
  return Boolean(added);
}

export function emptyPromptStats(id) {
  return {
    id: normalizePromptId(id),
    views: 0,
    likes: 0,
    copies: 0,
    ratingSum: 0,
    ratingCount: 0,
    avgRating: 0,
    averageRating: 0,
  };
}

export function coerceCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function getPromptStatsMap(kv, ids = []) {
  const uniqueIds = [...new Set(ids.map(normalizePromptId).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return {};
  }

  const keys = uniqueIds.flatMap((id) => [
    ...STAT_TYPES.map((type) => getPromptStatKey(id, type)),
    getPromptRatingSumKey(id),
    getPromptRatingCountKey(id),
  ]);
  const values = await kv.mget(...keys);

  return uniqueIds.reduce((statsMap, id, index) => {
    const offset = index * (STAT_TYPES.length + 2);
    const ratingSum = coerceCount(values[offset + 3]);
    const ratingCount = coerceCount(values[offset + 4]);
    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    statsMap[id] = {
      id,
      views: coerceCount(values[offset]),
      likes: coerceCount(values[offset + 1]),
      copies: coerceCount(values[offset + 2]),
      ratingSum,
      ratingCount,
      avgRating,
      averageRating: avgRating,
    };
    return statsMap;
  }, {});
}

export async function getRecentPromptStatsMap(kv, ids = [], days = TRENDING_WINDOW_DAYS) {
  const uniqueIds = [...new Set(ids.map(normalizePromptId).filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const dateKeys = getRecentDateKeys(days);
  const requests = dateKeys.flatMap((dateKey) =>
    TRENDING_STAT_TYPES.map((type) => kv.hgetall(getPromptDailyStatsKey(dateKey, type)))
  );
  const dailyMaps = await Promise.all(requests);
  const statsMap = Object.fromEntries(uniqueIds.map((id) => [id, emptyPromptStats(id)]));

  dailyMaps.forEach((dailyMap, index) => {
    const type = TRENDING_STAT_TYPES[index % TRENDING_STAT_TYPES.length];
    if (!dailyMap || typeof dailyMap !== 'object') return;

    uniqueIds.forEach((id) => {
      statsMap[id][type] += coerceCount(dailyMap[id]);
    });
  });

  uniqueIds.forEach((id) => {
    const stats = statsMap[id];
    stats.avgRating = stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 0;
    stats.averageRating = stats.avgRating;
  });

  return statsMap;
}

export function getPromptCreatedAt(prompt = {}, fallbackDate = '2026-04-30') {
  return prompt.createdAt || prompt.date || prompt.updatedAt || fallbackDate;
}

export function getTrendingScore(stats, createdAt) {
  const timestamp = Date.parse(createdAt);
  const postedAt = Number.isFinite(timestamp) ? timestamp : Date.parse('2026-04-30');
  const hoursSincePosted = Math.max(0, (Date.now() - postedAt) / 36e5);
  const views = coerceCount(stats.views);
  const likes = coerceCount(stats.likes);
  const copies = coerceCount(stats.copies);
  const ratingCount = coerceCount(stats.ratingCount);
  const avgRating = Math.max(0, Math.min(5, Number(stats.avgRating || stats.averageRating || 0)));

  const copyRate = views > 0 ? copies / views : 0;
  const likeRate = views > 0 ? likes / views : 0;

  // Engagement should beat simple recency: copies and likes are stronger intent signals than views.
  const actionScore = views * 0.25 + likes * 14 + copies * 24 + ratingCount * 12;
  const qualityScore =
    Math.min(copyRate, 0.35) * 140 + Math.min(likeRate, 0.25) * 90 + (avgRating / 5) * ratingCount * 8;
  const confidenceBoost = Math.log1p(views + (likes + copies + ratingCount) * 8) * 4;
  const freshnessScore = 8 / Math.pow(hoursSincePosted / 72 + 1, 0.8);

  // Engagement is already restricted to a rolling seven-day window. Freshness is
  // an additive tie-breaker so an older prompt can still trend after a new surge.
  return actionScore + qualityScore + confidenceBoost + freshnessScore;
}
