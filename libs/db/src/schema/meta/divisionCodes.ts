import { sql } from 'drizzle-orm'
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import { timestamps } from '../shared'

/** Curated Division codes scoped by domain and geographic category (class in other domains). */
export const metaDivisionCodes = sqliteTable(
  'divisionCodes',
  {
    domainCode: text('domainCode').notNull(),
    divisionCode: text('divisionCode').notNull(),
    divisionClass: text('divisionClass').notNull().default(''),
    canonicalId: text('canonicalId').notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.domainCode, table.divisionClass, table.divisionCode],
    }),
    index('divisionCodes_canonical_idx').on(table.domainCode, table.canonicalId),
    uniqueIndex('divisionCodes_geographic_administrative_code')
      .on(table.divisionCode)
      .where(
        sql`${table.domainCode} = 'geographic' AND ${table.divisionClass} IN ('country', 'sar', 'area', 'district')`,
      ),
    uniqueIndex('divisionCodes_geographic_locality_code')
      .on(table.divisionCode)
      .where(
        sql`${table.domainCode} = 'geographic' AND ${table.divisionClass} IN ('city', 'town', 'village', 'hamlet')`,
      ),
    uniqueIndex('divisionCodes_geographic_hood_code')
      .on(table.divisionCode)
      .where(
        sql`${table.domainCode} = 'geographic' AND ${table.divisionClass} IN ('macrohood', 'neighbourhood', 'microhood')`,
      ),
    uniqueIndex('divisionCodes_geographic_landform_code')
      .on(table.divisionCode)
      .where(
        sql`${table.domainCode} = 'geographic' AND ${table.divisionClass} IN ('major_island', 'minor_island', 'islet', 'island_group')`,
      ),
    check(
      'divisionCodes_geographic_class',
      sql`${table.domainCode} <> 'geographic' OR ${table.divisionClass} IN ('country', 'sar', 'area', 'district', 'city', 'town', 'village', 'hamlet', 'macrohood', 'neighbourhood', 'microhood', 'major_island', 'minor_island', 'islet', 'island_group')`,
    ),
  ],
)
