import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { streetSourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

export const hkgovTdPedestrianStreetKinds = [
  'partTimePedestrianStreet',
  'hawkerStreet',
  'marketStreet',
  'trafficCalmingStreet',
  'fullTimePedestrianStreet',
] as const
export type HkgovTdPedestrianStreetKind = (typeof hkgovTdPedestrianStreetKinds)[number]

/**
 * Pedestrian-street polygons published by the Transport Department.
 *
 * CSDI distributes five kinds with this same schema: Part-time Pedestrian,
 * Hawker, Market, Traffic Calming and Full-time Pedestrian Street. `OBJECTID`
 * is scoped to a kind, which forms part of sourceRecordId. The kind is retained
 * as the source-layer discriminator; publisher attributes live in rawProperties.
 */
export const sourceHkgovTdPedestrianStreets = sqliteTable(
  'hkgovTdPedestrianStreets',
  {
    ...streetSourceSpatialAssertionColumns(),
    kind: text('kind', { enum: hkgovTdPedestrianStreetKinds }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovTdPedestrianStreets'),
    index('hkgovTdPedestrianStreets_kind_idx').on(table.kind),
  ],
)
