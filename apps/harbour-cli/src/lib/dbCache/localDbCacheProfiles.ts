import { Database as SQLiteDatabase } from 'bun:sqlite'
import { historyEventTables } from '@repo/db'
import { VERSION_TABLES_WITH_CURRENT_ROWS } from './localDbCacheConfig.ts'
import type { CachePruneOperation, CacheTableProfile } from './localDbCacheTypes.ts'

export function resolveCacheTablesForBinding(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (bindingName === 'DB_META') {
    return []
  }

  if (bindingName === 'DB_CURRENT') {
    if (cacheTableProfile === 'divisionStatistic') {
      return [
        'statsDefinitionSets',
        'statsRecords',
        'statsPublicationState',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'statistics') {
      return [
        'statsDefinitionSets',
        'statsRecords',
        'statsPublicationState',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'street') {
      return [
        'divisions',
        'divisionPublicationState',
        'divisionsI18n',
        'streets',
        'streetPublicationState',
        'streetsI18n',
      ]
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionPublicationState', 'divisionsI18n']
    }

    if (cacheTableProfile === 'places') {
      return [
        'divisionAreas',
        'divisionAreaPublicationState',
        'divisions',
        'divisionPublicationState',
        'divisionsI18n',
        'streets',
        'streetPublicationState',
        'streetsI18n',
        'streetsAddress',
        'addressPublicationState',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address3d',
        'address3dI18n',
        'places',
        'placePublicationState',
        'placesI18n',
        'placeDivisionDefinitions',
        'placesDivision',
        'placesCells',
      ]
    }

    if (cacheTableProfile === 'address') {
      return [
        'divisionAreas',
        'divisionAreaPublicationState',
        'divisions',
        'divisionPublicationState',
        'divisionsI18n',
        'streets',
        'streetPublicationState',
        'streetsI18n',
        'addressPublicationState',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address3d',
        'address3dI18n',
      ]
    }

    if (
      cacheTableProfile === 'divisionGeometry' ||
      cacheTableProfile === 'planningDivisionGeometry'
    ) {
      return [
        'divisions',
        'divisionPublicationState',
        'divisionsI18n',
        'divisionAreas',
        'divisionAreaPublicationState',
        'divisionBoundaries',
        'divisionBoundaryPublicationState',
      ]
    }

    return [
      'divisions',
      'divisionPublicationState',
      'divisionsI18n',
      'streets',
      'streetPublicationState',
      'streetsI18n',
      'streetsAddress',
      'places',
      'placePublicationState',
      'placesI18n',
      'placeDivisionDefinitions',
      'placesDivision',
      'placesCells',
      'addressPublicationState',
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
      'address3d',
      'address3dI18n',
      'divisionAreas',
      'divisionAreaPublicationState',
      'divisionBoundaries',
      'divisionBoundaryPublicationState',
      'statsDefinitionSets',
      'statsRecords',
      'statsPublicationState',
      'statsFields',
      'statsFieldsI18n',
      'statsMeasures',
      'statsMeasuresI18n',
      'statsValuesI18n',
    ]
  }

  if (/^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'divisionStatistic') {
      return [
        'divisionStatistics',
        'statsDefinitionSets',
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'statistics') {
      return [
        'statsDefinitionSets',
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (cacheTableProfile === 'places') {
      return [
        'divisionAreas',
        'divisions',
        'divisionsI18n',
        'address3d',
        'address3dI18n',
        'places',
        'placesI18n',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
      ]
    }

    if (cacheTableProfile === 'address') {
      return [
        'divisionAreas',
        'divisions',
        'divisionsI18n',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address3d',
        'address3dI18n',
      ]
    }

    if (
      cacheTableProfile === 'divisionGeometry' ||
      cacheTableProfile === 'planningDivisionGeometry'
    ) {
      return cacheTableProfile === 'planningDivisionGeometry'
        ? ['divisions', 'divisionsI18n', 'divisionAreas', 'divisionBoundaries']
        : ['divisionAreas', 'divisionBoundaries']
    }

    return [
      'divisions',
      'divisionsI18n',
      'address2d',
      'places',
      'placesI18n',
      'address2dI18n',
      'address2dBuildingNumberLookup',
      'address3d',
      'address3dI18n',
      'divisionAreas',
      'divisionBoundaries',
      'divisionStatistics',
      'statsDefinitionSets',
      'statsRecords',
      'statsFields',
      'statsFieldsI18n',
      'statsMeasures',
      'statsMeasuresI18n',
      'statsValuesI18n',
    ]
  }

  if (/^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'divisionStatistic') {
      return ['hkgovCenstatdGeometry', 'hkgovCenstatdStatistics']
    }

    if (cacheTableProfile === 'statistics') {
      return ['hkgovCenstatdGeometry', 'hkgovCenstatdStatistics']
    }

    if (cacheTableProfile === 'nativeSource') {
      return [
        'hkgovHydStreetNamePlates',
        'hkgovHydSensitiveStreets',
        'hkgovHydStrategicStreets',
        'hkgovTdPedestrianStreets',
        'hkgovCenstatdGeometry',
        'hkgovCenstatdStatistics',
        'hkgovCenstatdGeometryDerivatives',
        'hkgovLandsdPlaceNames',
        'hkgovLandsdRoadCentrelines',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['hkgovLandsdStreets', 'hkgovLandsdStreetI18n']
    }

    if (cacheTableProfile === 'division') {
      return [
        'overtureDivisions',
        'ssDivision',
        'hkgovPlandPlanningCells',
        'hkgovPlandNewTowns',
      ]
    }

    if (cacheTableProfile === 'places') {
      return ['overturePlaces']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return [
        'overtureDivisions',
        'ssDivision',
        'overtureDivisionAreas',
        'ssDivisionArea',
        'overtureDivisionBoundaries',
        'hkgovHadDivisionAreas',
        'hkgovCenstatdGeometry',
        'hkgovCenstatdStatistics',
        'hkgovCenstatdGeometryDerivatives',
      ]
    }

    if (cacheTableProfile === 'planningDivisionGeometry') {
      return []
    }

    return [
      'overtureDivisions',
      'ssDivision',
      'overturePlaces',
      'overtureDivisionAreas',
      'ssDivisionArea',
      'overtureDivisionBoundaries',
      'hkgovHadDivisionAreas',
      'hkgovCenstatdGeometry',
      'hkgovCenstatdStatistics',
      'hkgovCenstatdGeometryDerivatives',
      'hkgovPlandPlanningCells',
      'hkgovPlandNewTowns',
      'hkgovAlsAddresses2d',
      'hkgovAlsAddresses3d',
      'hkgovHydStreetNamePlates',
      'hkgovHydSensitiveStreets',
      'hkgovHydStrategicStreets',
      'hkgovTdPedestrianStreets',
      'hkgovLandsdPlaceNames',
      'hkgovLandsdRoadCentrelines',
    ]
  }

  return []
}

function resolveExpectedTablesForBinding(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (bindingName === 'DB_META') {
    return [
      'publishers',
      'licenses',
      'datasets',
      'dataShards',
      'apiVersions',
      'apiReleaseSets',
      'resourceReleases',
      'snapshots',
      'snapshotResourceReleases',
      'snapshotRecipes',
      'snapshotRecipeInputs',
      'snapshotAssemblies',
      'snapshotDependencies',
    ]
  }

  return resolveCacheTablesForBinding(bindingName, cacheTableProfile)
}

export async function hasExpectedTables(
  filePath: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  const expectedTables = resolveExpectedTablesForBinding(bindingName, cacheTableProfile)

  if (expectedTables.length === 0) {
    return true
  }

  const sqlite = new SQLiteDatabase(filePath, { readonly: true })

  try {
    const rows = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    const tableNames = new Set(rows.map(row => row.name))

    if (!expectedTables.every(tableName => tableNames.has(tableName))) return false
    if (bindingName.startsWith('DB_HISTORY_')) {
      if (
        !sqlite
          .query(
            "SELECT 1 FROM sqlite_schema WHERE type='view' AND name='historyEvents'",
          )
          .get()
      )
        return false
      const canonical = new Set<string>(
        Object.values(historyEventTables).map(value => value.table),
      )
      for (const table of expectedTables.filter(name => canonical.has(name))) {
        const columns = sqlite
          .query<{ name: string; pk: number }, []>(`PRAGMA table_info("${table}")`)
          .all()
        if (
          !columns.some(column => column.name === 'operation') ||
          !columns.some(column => column.name === 'snapshotId' && column.pk > 0)
        )
          return false
      }
    }
    return true
  } finally {
    sqlite.close()
  }
}

export async function assertCachedDatabaseHasExpectedTables(
  filePath: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (await hasExpectedTables(filePath, bindingName, cacheTableProfile)) {
    return
  }

  throw new Error(
    [
      `Cache validation failed for ${bindingName}.`,
      `The mirrored database at ${filePath} does not contain the expected tables.`,
      'Remove .local/harbour-sql/db-cache and retry the upload.',
    ].join(' '),
  )
}

export function shouldMirrorTableSchemaOnly(
  bindingName: string,
  tableName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  return (
    (cacheTableProfile === 'divisionStatistic' &&
      (bindingName === 'DB_CURRENT' ||
        /^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName))) ||
    (cacheTableProfile === 'planningDivisionGeometry' &&
      bindingName === 'DB_HISTORY_HK_BEFORE' &&
      (tableName === 'divisionAreas' || tableName === 'divisionBoundaries'))
  )
}

export function shouldMirrorBindingSchemaOnly(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  return (
    cacheTableProfile === 'planningDivisionGeometry' &&
    /^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)
  )
}

export function resolveCachePruneOperation(
  bindingName: string,
  tableName: string,
): CachePruneOperation | null {
  // Every event may be selected by a retained branch, including deletion events.
  if (bindingName.startsWith('DB_HISTORY_')) return null
  if (
    !/^DB_SOURCE_[A-Z]{2}_\d{4}$/.test(bindingName) ||
    !VERSION_TABLES_WITH_CURRENT_ROWS.has(tableName)
  ) {
    return null
  }

  return {
    retainedRowsWhereSql: '"isCurrent" = 1',
    tableName,
    whereSql: '"isCurrent" <> 1',
  }
}
