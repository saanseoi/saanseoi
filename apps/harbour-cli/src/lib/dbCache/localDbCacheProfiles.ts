import { Database as SQLiteDatabase } from 'bun:sqlite'
import type { CachePruneOperation, CacheTableProfile } from './localDbCacheTypes.ts'
import { VERSION_TABLES_WITH_CURRENT_ROWS } from './localDbCacheConfig.ts'

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
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['divisions', 'divisionsI18n', 'streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (cacheTableProfile === 'places') {
      return [
        'divisions',
        'divisionsI18n',
        'streets',
        'streetsI18n',
        'streetsAddress',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address3d',
        'address3dI18n',
        'places',
        'placesI18n',
        'placesDivision',
        'placesCells',
      ]
    }

    if (cacheTableProfile === 'address') {
      return [
        'divisions',
        'divisionsI18n',
        'streets',
        'streetsI18n',
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
        : ['divisions', 'divisionsI18n', 'divisionAreas', 'divisionBoundaries']
    }

    return [
      'divisions',
      'divisionsI18n',
      'streets',
      'streetsI18n',
      'streetsAddress',
      'places',
      'placesI18n',
      'placesDivision',
      'placesCells',
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
      'address3d',
      'address3dI18n',
      'divisionAreas',
      'divisionBoundaries',
      'statsRecords',
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
        'sourceResolutions',
        'divisionStatistics',
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
        'sourceResolutions',
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['snapshotVersionChanges', 'streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return [
        'divisions',
        'divisionsI18n',
        'sourceResolutions',
        'snapshotVersionChanges',
      ]
    }

    if (cacheTableProfile === 'places') {
      return [
        'places',
        'placesI18n',
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'sourceResolutions',
        'snapshotVersionChanges',
      ]
    }

    if (cacheTableProfile === 'address') {
      return [
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address3d',
        'address3dI18n',
        'sourceResolutions',
        'snapshotVersionChanges',
      ]
    }

    if (
      cacheTableProfile === 'divisionGeometry' ||
      cacheTableProfile === 'planningDivisionGeometry'
    ) {
      return cacheTableProfile === 'planningDivisionGeometry'
        ? [
            'divisions',
            'divisionsI18n',
            'divisionAreas',
            'divisionBoundaries',
            'sourceResolutions',
            'snapshotVersionChanges',
          ]
        : [
            'divisionAreas',
            'divisionBoundaries',
            'sourceResolutions',
            'snapshotVersionChanges',
          ]
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
      'statsRecords',
      'statsFields',
      'statsFieldsI18n',
      'statsMeasures',
      'statsMeasuresI18n',
      'statsValuesI18n',
      'sourceResolutions',
      'snapshotVersionChanges',
    ]
  }

  if (/^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'divisionStatistic') {
      return ['hkgovCenstatdDistrictLandAreaPopulationDensities']
    }

    if (cacheTableProfile === 'statistics') {
      return [
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
        'hkgovCenstatdStatistics',
      ]
    }

    if (cacheTableProfile === 'nativeSource') {
      return [
        'hkgovHydStreetNamePlates',
        'hkgovHydSensitiveStreets',
        'hkgovHydStrategicStreets',
        'hkgovTdPedestrianStreets',
        'hkgovCenstatdDivisionAreas',
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
        'hkgovCenstatdStatistics',
        'hkgovCenstatdDivisionAreaDerivatives',
        'hkgovLandsdPlaceNames',
        'hkgovLandsdRoadCentrelines',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['hkgovLandsdStreets', 'hkgovLandsdStreetI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['overtureDivisions', 'hkgovPlandPlanningCells', 'hkgovPlandNewTowns']
    }

    if (cacheTableProfile === 'places') {
      return ['overturePlaces']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return [
        'overtureDivisions',
        'overtureDivisionAreas',
        'overtureDivisionBoundaries',
        'hkgovHadDivisionAreas',
        'hkgovCenstatdDivisionAreas',
        'hkgovCenstatdDivisionAreaDerivatives',
      ]
    }

    if (cacheTableProfile === 'planningDivisionGeometry') {
      return []
    }

    return [
      'overtureDivisions',
      'overturePlaces',
      'overtureDivisionAreas',
      'overtureDivisionBoundaries',
      'hkgovHadDivisionAreas',
      'hkgovCenstatdDivisionAreas',
      'hkgovCenstatdDivisionAreaDerivatives',
      'hkgovPlandPlanningCells',
      'hkgovPlandNewTowns',
      'hkgovAlsAddresses2d',
      'hkgovAlsAddresses3d',
      'hkgovHydStreetNamePlates',
      'hkgovHydSensitiveStreets',
      'hkgovHydStrategicStreets',
      'hkgovTdPedestrianStreets',
      'hkgovCenstatdDistrictLandAreaPopulationDensities',
      'hkgovCenstatdStatistics',
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
      'publisherI18n',
      'licenses',
      'datasets',
      'datasetI18n',
      'dataShards',
      'apiVersions',
      'apiReleaseSets',
      'releases',
      'snapshots',
      'snapshotSources',
      'snapshotAssembly',
      'snapshotAssemblySources',
      'snapshotAssemblyRuns',
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

    return expectedTables.every(tableName => tableNames.has(tableName))
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
      (tableName === 'divisionAreas' ||
        tableName === 'divisionBoundaries' ||
        tableName === 'snapshotVersionChanges'))
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
  // Published Division statistics replay both the selected cohort and its
  // predecessor. Their journals can reference superseded identity/name hashes.
  if (
    bindingName.startsWith('DB_HISTORY_') &&
    (tableName === 'divisions' || tableName === 'divisionsI18n')
  )
    return null
  if (
    !/^DB_(?:HISTORY|SOURCE)_[A-Z]{2}_\d{4}$/.test(bindingName) ||
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
