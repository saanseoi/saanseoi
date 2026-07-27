import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import {
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

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
    // Region: publisher compatibility value carried through to canonical sourceKeys.
    regionCode: text('regionCode'),
    // Start_Time and End_Time
    startTime: text('startTime'),
    endTime: text('endTime'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovTdPedestrianStreets'),
    index('hkgovTdPedestrianStreets_kind_idx').on(table.kind),
    index('hkgovTdPedestrianStreets_kind_object_idx').on(table.kind, table.objectId),
  ],
)

/** Localised publisher descriptions for TD pedestrian-street assertions. */
export const sourceHkgovTdPedestrianStreetI18n = sqliteTable(
  'hkgovTdPedestrianStreetI18n',
  {
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    description: text('description').notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash, table.locale] }),
    ...sourceVersionIndexes(table, 'hkgovTdPedestrianStreetI18n'),
    index('hkgovTdPedestrianStreetI18n_locale_idx').on(table.locale),
  ],
)
