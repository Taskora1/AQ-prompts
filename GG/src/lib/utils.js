import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

export function parseStableDate(value) {
  const input = String(value || '').trim();
  if (!input) return null;

  if (DATE_ONLY_RE.test(input)) {
    const [year, month, day] = input.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatStableDate(value, options = {}) {
  const {
    fallback = 'Recent post',
    month = 'short',
    day = 'numeric',
    year = 'numeric',
  } = options;

  const date = parseStableDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('en-US', {
    month,
    day,
    year,
    timeZone: 'UTC',
  }).format(date);
}
