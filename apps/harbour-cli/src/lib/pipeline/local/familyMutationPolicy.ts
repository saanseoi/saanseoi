import {
  currentSchema,
  historySchema,
  metaSchema,
  sourceSchema,
  getTableName,
  getTableColumns,
} from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import type { ResolvedSqlTarget } from './resolvedSqlPlan.ts'

export type ResolvedFamily = 'division' | 'street' | 'geometry' | 'statistics'
const current = {
  division: ['divisions', 'divisionsI18n'],
  street: [
    'streets',
    'streetsI18n',
    'streetChangelog',
    'streetNameChanges',
    'streetNameChangeStreets',
    'streetGeometry',
    'streetsAddress',
  ],
  geometry: ['divisionAreas', 'divisionBoundaries'],
  statistics: [
    'statsRecords',
    'statsFields',
    'statsFieldsI18n',
    'statsMeasures',
    'statsMeasuresI18n',
    'statsValuesI18n',
  ],
}
const sources = {
  division: ['overtureDivisions', 'hkgovPlandNewTowns', 'hkgovPlandPlanningCells'],
  street: [
    'hkgovLandsdStreetBaselineRecords',
    'hkgovLandsdStreetNotices',
    'hkgovLandsdStreetNoticeApplications',
  ],
  geometry: [
    'overtureDivisionAreas',
    'overtureDivisionBoundaries',
    'hkgovHadDivisionAreas',
    'hkgovCenstatdDivisionAreas',
    'hkgovCenstatdDivisionAreaDerivatives',
  ],
  statistics: [
    'hkgovCenstatdStatistics',
    'hkgovCenstatdDistrictLandAreaPopulationDensities',
  ],
}

/** Adapters own these tables; publication and search transitions have separate writers. */
export function familyMutationTargets(
  context: LocalAddressDbContext,
  family: ResolvedFamily,
): Record<string, ResolvedSqlTarget> {
  if (!context.state.files)
    throw new Error('Final-difference planning requires local mirror files.')
  return Object.fromEntries(
    Object.entries(context.state.files).map(([binding, path]) => {
      const names =
        binding === 'DB_CURRENT'
          ? current[family]
          : binding === 'DB_META'
            ? []
            : binding.startsWith('DB_HISTORY')
              ? [
                  ...current[family].filter(name => name !== 'streetsAddress'),
                  ...(family === 'statistics' ? ['divisionStatistics'] : []),
                  'snapshotVersionChanges',
                  'sourceResolutions',
                ]
              : binding.startsWith('DB_SOURCE')
                ? sources[family]
                : []
      const schema =
        binding === 'DB_CURRENT'
          ? currentSchema
          : binding === 'DB_META'
            ? metaSchema
            : binding.startsWith('DB_HISTORY')
              ? historySchema
              : sourceSchema
      return [
        binding,
        {
          path,
          schema,
          retainSql: binding === 'DB_META',
          excludedTables:
            binding === 'DB_META'
              ? Object.values(metaSchema)
                  .map(value => getTableName(value as never) as unknown)
                  .filter((name): name is string => typeof name === 'string')
              : [],
          databaseId: context.state.bindings?.[binding]?.databaseId ?? binding,
          tables: names.map(name => {
            const table = Object.values(schema).find(
              value => getTableName(value as never) === name,
            )
            if (!table) throw new Error(`Unknown owned table: ${binding}.${name}`)
            const columns = getTableColumns(table as never)
            return {
              name,
              ...(!['sourceResolutions'].includes(name)
                ? {
                    ignoredColumns: ['createdAt', 'updatedAt'].filter(
                      column => column in columns,
                    ),
                  }
                : {}),
            }
          }),
        },
      ]
    }),
  )
}
