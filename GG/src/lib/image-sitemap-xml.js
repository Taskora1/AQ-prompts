function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildImageSitemapXml(pages) {
  const entries = [];
  const seen = new Set();

  for (const page of pages) {
    if (!page?.url || !Array.isArray(page.images)) continue;

    for (const image of page.images) {
      if (typeof image !== 'string' || !image.trim()) continue;
      const key = `${page.url}\n${image}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(`  <url>
    <loc>${escapeXml(page.url)}</loc>
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
    </image:image>
  </url>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;
}
