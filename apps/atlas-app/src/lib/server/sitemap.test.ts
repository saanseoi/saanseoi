import { describe, expect, test } from 'bun:test'
import { escapeXml, renderSitemap } from './sitemap.js'

describe('sitemap rendering', () => {
  test('escapes XML values', () => {
    expect(escapeXml('/a?x=1&y="two"')).toBe('/a?x=1&amp;y=&quot;two&quot;')
  })

  test('deduplicates and sorts URLs', () => {
    const xml = renderSitemap([
      { path: '/sources/places/2025' },
      { path: '/' },
      { path: '/sources/places/2025', lastmod: '2026-08-21T00:00:00.000Z' },
    ])

    expect(xml).toContain('<loc>https://saanseoi.hk/</loc>')
    expect(xml).toContain('<lastmod>2026-08-21T00:00:00.000Z</lastmod>')
    expect(xml.match(/<loc>/g)).toHaveLength(2)
    expect(xml.indexOf('https://saanseoi.hk/</loc>')).toBeLessThan(
      xml.indexOf('https://saanseoi.hk/sources/places/2025</loc>'),
    )
  })
})
