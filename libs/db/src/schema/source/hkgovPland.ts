import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import {
  sourceAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

/**
 * Raw CSDI TPU/subunit features. `canonicalGeometry` records the explicitly
 * approved buffer(0) repair when the source ring self-intersects.
 */
export const sourceHkgovPlandPlanningCells = sqliteTable(
  'hkgovPlandPlanningCells',
  {
    ...sourceAssertionColumns(),
    ppuCode: text('ppuCode').notNull(),
    spuCode: text('spuCode').notNull(),
    tpuCode: text('tpuCode').notNull(),
    subunitCode: text('subunitCode').notNull(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    canonicalGeometry: jsonText('canonicalGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandPlanningCells'),
    index('hkgovPlandPlanningCells_tpuCode_idx').on(table.tpuCode),
    index('hkgovPlandPlanningCells_spuCode_idx').on(table.spuCode),
    index('hkgovPlandPlanningCells_ppuCode_idx').on(table.ppuCode),
  ],
)

/** Derived source assertions for Planning Department canonical planning divisions. */
export const sourceHkgovPlandDivisions = sqliteTable(
  'hkgovPlandDivisions',
  {
    ...sourceAssertionColumns(),
    planningLevel: text('planningLevel').notNull(),
    ppuCode: text('ppuCode'),
    spuCode: text('spuCode'),
    tpuCode: text('tpuCode'),
    subunitCode: text('subunitCode'),
    newTownId: text('newTownId'),
    sourceCellIds: jsonText('sourceCellIds').notNull(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    canonicalGeometry: jsonText('canonicalGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandDivisions'),
    index('hkgovPlandDivisions_planningLevel_idx').on(table.planningLevel),
    index('hkgovPlandDivisions_tpuCode_idx').on(table.tpuCode),
    index('hkgovPlandDivisions_newTownId_idx').on(table.newTownId),
  ],
)

/** Source labels for Planning Department canonical planning divisions. */
export const sourceHkgovPlandDivisionI18n = sqliteTable(
  'hkgovPlandDivisionI18n',
  {
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovPlandDivisionI18n'),
    index('hkgovPlandDivisionI18n_locale_idx').on(table.locale),
  ],
)

/** Derived source assertions for the planning-area provider variant. */
export const sourceHkgovPlandDivisionAreas = sqliteTable(
  'hkgovPlandDivisionAreas',
  {
    ...sourceAssertionColumns(),
    divisionId: text('divisionId').notNull(),
    planningLevel: text('planningLevel').notNull(),
    sourceCellIds: jsonText('sourceCellIds').notNull(),
    repairedSourceFeatureIds: jsonText('repairedSourceFeatureIds').notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandDivisionAreas'),
    index('hkgovPlandDivisionAreas_divisionId_idx').on(table.divisionId),
    index('hkgovPlandDivisionAreas_planningLevel_idx').on(table.planningLevel),
  ],
)

/** Raw New Town provider assertions for cohort-scoped planning divisions. */
export const sourceHkgovPlandNewTownDivisionAreas = sqliteTable(
  'hkgovPlandNewTownDivisionAreas',
  {
    ...sourceAssertionColumns(),
    divisionId: text('divisionId').notNull(),
    newTownId: text('newTownId').notNull(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    canonicalGeometry: jsonText('canonicalGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTownDivisionAreas'),
    index('hkgovPlandNewTownDivisionAreas_divisionId_idx').on(table.divisionId),
    index('hkgovPlandNewTownDivisionAreas_newTownId_idx').on(table.newTownId),
  ],
)

/** Trilingual source labels for Planning Department New Town geometry assertions. */
export const sourceHkgovPlandNewTownDivisionAreaI18n = sqliteTable(
  'hkgovPlandNewTownDivisionAreaI18n',
  {
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTownDivisionAreaI18n'),
    index('hkgovPlandNewTownDivisionAreaI18n_locale_idx').on(table.locale),
  ],
)
