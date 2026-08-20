import { getSitemapEntries } from '#lib/server/sitemap.server.js'
import { renderSitemap } from '#lib/server/sitemap.js'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () =>
  new Response(renderSitemap(await getSitemapEntries()), {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
