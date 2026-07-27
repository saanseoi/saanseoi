import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

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
 * is scoped to a kind, so it is indexed together with `kind`.
 */
export const sourceHkgovTdPedestrianStreets = sqliteTable(
  'hkgovTdPedestrianStreets',
  {
    ...sourceSpatialAssertionColumns(),
    kind: text('kind', { enum: hkgovTdPedestrianStreetKinds }).notNull(),
    // OBJECTID
    objectId: integer('objectId').notNull(),
    // Start_Time and End_Time
    startTime: text('startTime'),
    endTime: text('endTime'),
    // Publisher `*_Description` fields; retained exactly as published.
    descriptionEn: text('descriptionEn'),
    descriptionZhHant: text('descriptionZhHant'),
    descriptionZhHans: text('descriptionZhHans'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovTdPedestrianStreets'),
    index('hkgovTdPedestrianStreets_kind_idx').on(table.kind),
    index('hkgovTdPedestrianStreets_kind_object_idx').on(table.kind, table.objectId),
  ],
)
