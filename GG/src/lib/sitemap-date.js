export function formatSitemapLastModified(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }

  const input = String(value ?? '').trim();
  if (!input) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(`${input}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input
      ? input
      : undefined;
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}
