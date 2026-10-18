import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { jsonText, timestamps } from '../shared'

/** Reproducible source statistics and recovered metadata for a pinned basemap. */
export const metaBasemapReleaseStats = sqliteTable('basemapReleaseStats', {
  id: text('id').primaryKey(),
  region: text('region').notNull(),
  version: text('version').notNull(),
  archiveSha256: text('archiveSha256').notNull(),
  statistics: jsonText<{
    method: string
    generatedAt: string
    sourceSha256: string
    boundarySha256: string
    extractSha256: string
    counts: Record<string, number>
    layers: Array<{ id: string; minzoom: number; maxzoom: number }>
    minZoom: number
    maxZoom: number
    addressedTiles: number
    schema: { version: string; base: string }
  }>('statistics').notNull(),
  ...timestamps,
})
