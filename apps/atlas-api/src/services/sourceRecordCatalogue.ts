import type { SourceFamily } from './sourceRecords'

export type SourceRecordCatalogueEntry = {
  resourceType?: string
  scopeByDataset?: boolean
  datasetColumn?: 'datasetCode'
  exactReleaseMembership?: boolean
  geometryColumn?: 'sourceGeometry'
  geometryEncoding?: 'brotli-json'
  randomSampleStrategy?: 'uuid-pivot'
  randomSamplePrefix?: string
  tableName: string
}

const DIVISION_SOURCE_RECORD_CATALOGUE = {
  'ds-hk-hkgov-rvd-division': {
    tableName: 'hkgovRvdAreas',
  },
  'ds-hk-protomaps-island': {
    resourceType: 'divisionArea',
    geometryColumn: 'sourceGeometry',
    tableName: 'protomapsIslandFeatures',
  },
  'ds-hk-saanseoi-division': {
    geometryColumn: 'sourceGeometry',
    scopeByDataset: true,
    tableName: 'ssDivision',
  },
  'ds-hk-hkgov-had-division-area-district': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovHadDivisionAreas',
  },
  'ds-hk-hkgov-landsd-division': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovLandsdPlaceNames',
  },
  'ds-hk-hkgov-pland-division-new-town': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovPlandNewTowns',
  },
  'ds-hk-hkgov-pland-division-pu': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovPlandPlanningCells',
  },
  'ds-hk-overture-division': {
    geometryColumn: 'sourceGeometry',
    randomSampleStrategy: 'uuid-pivot',
    tableName: 'overtureDivisions',
  },
} as const satisfies Record<string, SourceRecordCatalogueEntry>

const ADDRESS_SOURCE_RECORD_CATALOGUE = {
  'ds-hk-hkgov-dpo-address': {
    randomSampleStrategy: 'uuid-pivot',
    geometryColumn: 'sourceGeometry',
    tableName: `(SELECT sourceRecordId, versionHash, validFromRelease, validToRelease, properties, sourceGeometry
      FROM hkgovAlsAddresses2d UNION ALL
      SELECT sourceRecordId, versionHash, validFromRelease, validToRelease, properties, sourceGeometry
      FROM hkgovAlsAddresses3d)`,
  },
} as const satisfies Record<string, SourceRecordCatalogueEntry>

const STATISTIC_SOURCE_RECORD_CATALOGUE: Record<string, SourceRecordCatalogueEntry> =
  Object.fromEntries(
    [
      'major-housing-estates',
      'new-towns',
      'permanent-living-quarters',
      'permanent-living-quarters-district',
      'population-households-district',
      'housing-market-areas-building-groups',
      'subdivided-units-district',
      'land-area-population-density-district',
    ].map(name => [
      `ds-hk-hkgov-censtatd-division-statistic-${name}`,
      {
        geometryColumn: 'sourceGeometry',
        geometryEncoding: 'brotli-json',
        tableName: 'hkgovCenstatdStatistics',
        datasetColumn: 'datasetCode',
        exactReleaseMembership: true,
      },
    ]),
  )

const PLACE_SOURCE_RECORD_CATALOGUE = {
  'ds-hk-overture-place': {
    geometryColumn: 'sourceGeometry',
    randomSampleStrategy: 'uuid-pivot',
    tableName: 'overturePlaces',
  },
} as const satisfies Record<string, SourceRecordCatalogueEntry>

const STREET_SOURCE_RECORD_CATALOGUE: Record<string, SourceRecordCatalogueEntry> = {
  ...Object.fromEntries(
    [
      ['ds-hk-hkgov-landsd-road-centreline', 'hkgovLandsdRoadCentrelines'],
      ['ds-hk-hkgov-hyd-street', 'hkgovHydStreetNamePlates'],
      ['ds-hk-hkgov-hyd-sensitive-street', 'hkgovHydSensitiveStreets'],
      ['ds-hk-hkgov-hyd-strategic-street', 'hkgovHydStrategicStreets'],
      ['ds-hk-hkgov-hyd-pedestrian-street', 'hkgovTdPedestrianStreets'],
    ].map(([code, tableName]) => [
      code,
      { tableName, geometryColumn: 'sourceGeometry' },
    ]),
  ),
  // These publishers supply PDFs. Project the retained structured extraction
  // into the API envelope without changing its storage or discarding evidence.
  'ds-hk-hkgov-landsd-street': {
    tableName: `(SELECT sourceRecordId, versionHash, validFromRelease, validToRelease,
      json_object('nameEn', nameEn, 'nameZhHant', nameZhHant, 'districtCode', districtCode) AS properties
      FROM hkgovLandsdStreetBaselineRecords
      UNION ALL
      SELECT sourceRecordId, versionHash, validFromRelease, validToRelease,
      json_object('nameEn', nameEn, 'nameZhHant', nameZhHant,
        'descriptionEn', descriptionEn, 'descriptionZhHant', descriptionZhHant,
        'gazetteDate', gazetteDate, 'effectiveDate', effectiveDate, 'kind', kind,
        'noticeRef', noticeRef, 'previousNoticeRefs', json(previousNoticeRefs),
        'districtCodes', json(districtCodes), 'rawExtractedText', json(rawExtractedText),
        'parserDiagnostics', json(parserDiagnostics), 'evidenceAssets', json(evidenceAssets)) AS properties
      FROM hkgovLandsdStreetNotices)`,
  },
}

export function sourceCatalogueFor(
  family: SourceFamily,
  resourceType?: string,
): Record<string, SourceRecordCatalogueEntry> {
  switch (family) {
    case 'addresses':
      return ADDRESS_SOURCE_RECORD_CATALOGUE
    case 'divisions':
      return {
        ...DIVISION_SOURCE_RECORD_CATALOGUE,
        ...(resourceType === 'divisionArea'
          ? {
              'ds-hk-saanseoi-division': {
                geometryColumn: 'sourceGeometry' as const,
                scopeByDataset: true,
                tableName: 'ssDivisionArea',
              },
              'ds-hk-overture-division': {
                geometryColumn: 'sourceGeometry' as const,
                randomSampleStrategy: 'uuid-pivot' as const,
                tableName: 'overtureDivisionAreas',
                geometryEncoding: 'brotli-json' as const,
              },
            }
          : resourceType === 'divisionBoundary'
            ? {
                'ds-hk-overture-division': {
                  geometryColumn: 'sourceGeometry' as const,
                  randomSampleStrategy: 'uuid-pivot' as const,
                  tableName: 'overtureDivisionBoundaries',
                  geometryEncoding: 'brotli-json' as const,
                },
              }
            : {}),
        ...STATISTIC_SOURCE_RECORD_CATALOGUE,
      }
    case 'places':
      return PLACE_SOURCE_RECORD_CATALOGUE
    case 'stats':
      return STATISTIC_SOURCE_RECORD_CATALOGUE
    case 'streets':
      return STREET_SOURCE_RECORD_CATALOGUE
  }
}
