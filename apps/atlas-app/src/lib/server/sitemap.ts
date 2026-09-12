export type SitemapEntry = {
  path: string
  lastmod?: string
}

export function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    character =>
      ({
        '&': '&amp;',
        "'": '&apos;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[character] ?? character,
  )
}

export function renderSitemap(entries: SitemapEntry[]) {
  const uniqueEntries = new Map<string, SitemapEntry>()
  for (const entry of entries) uniqueEntries.set(entry.path, entry)

  const urls = [...uniqueEntries.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(entry => {
      const lastmod = entry.lastmod
        ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : ''
      return `  <url>\n    <loc>${escapeXml(`https://saanseoi.hk${entry.path}`)}</loc>${lastmod}\n  </url>`
    })

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}
