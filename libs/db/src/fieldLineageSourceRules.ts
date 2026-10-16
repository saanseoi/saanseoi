/** SOURCE is publisher evidence; these rules never describe canonical repairs as source values. */
export function sourceRetentionSpecification(
  datasetCode: string,
  outputPath: string,
  resourceType?: string,
) {
  const common = {
    outputPath,
    keyMapping:
      'retainSourceProperties recursively maps attribute names to camelCase and locale label suffixes; preserves common/variant/perspectives mapping keys and locale keys; rejects collisions.',
    additionalImplementations: [
      {
        path: 'libs/core/src/pipeline/services/sources/retainedProperties.ts',
        symbol: 'retainSourceProperties',
      },
    ],
  }
  if (datasetCode === 'ds-hk-hkgov-landsd-division')
    return {
      ...common,
      inputs: ['publisherRecord'],
      expression:
        'Retain publisher properties and related placeNames (publisher labels and nameStatus) from the native FileGDB join in hkgovLandsdPlaceNames; sourceRecordId = LANDSD:PLACE_NAME:<GEO_NAME_ID>; retain native sourceGeometry. Canonical settlement selection and projected geometry are independent.',
      implementation: {
        path: 'apps/harbour-dataops/src/commands/hkgovLandsdNative.ts',
        symbol: 'runHkgovLandsdPlaceNameIngestCommand',
      },
    }
  if (datasetCode.startsWith('ds-hk-overture-'))
    return {
      ...common,
      expression:
        'overtureSourcePayload(publisherRow); select outputPath. id is the source envelope identity, not a property. Geometry bytes are retained as {encoding:"wkb-base64",data}; other geometry is unchanged or null.',
      inputs: ['publisherRow'],
      implementation: {
        path: 'libs/core/src/pipeline/services/sources/sourcePayload.ts',
        symbol: 'overtureSourcePayloadInternal',
      },
      guards: [
        'Publisher sources must be null or an array whose entries have string dataset names.',
      ],
    }
  if (datasetCode === 'ds-hk-hkgov-dpo-address')
    return {
      ...common,
      expression:
        'alsSourcePayloadInternal(feature); recursively flatten non-empty property objects through JSON Pointer paths and alsSourcePropertyName. Preserve arrays, nulls, empty objects and values; clone source geometry without canonical correction. Select outputPath.',
      inputs: ['publisherFeature'],
      implementation: {
        path: 'libs/core/src/pipeline/services/sources/alsSourcePayload.ts',
        symbol: 'alsSourcePayloadInternal',
      },
      guards: [
        'Properties must be an object or null; duplicate mapped keys are errors.',
      ],
    }
  if (datasetCode.startsWith('ds-hk-hkgov-pland-'))
    return {
      ...common,
      expression:
        'insertSourceRows retains each original cell/town occurrence: properties = retainSourceProperties(record.properties), sourceGeometry = record.sourceGeometry. Select outputPath before any canonical aggregate geometry substitution.',
      inputs: ['publisherRecord'],
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadRows.ts',
        symbol: 'insertSourceRows',
      },
    }
  if (datasetCode.startsWith('ds-hk-hkgov-censtatd-'))
    return {
      ...common,
      expression:
        'sourceStatisticAssertion(row) retains publisher properties through retainSourceProperties and sourceGeometry unchanged; select outputPath. Prepared statistical values, metadata and canonical geometry are separate outputs.',
      inputs: ['publisherRecord'],
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/sourceStatisticAssertion.ts',
        symbol: 'sourceStatisticAssertion',
      },
    }
  if (
    datasetCode === 'ds-hk-hkgov-had-division-area-district' ||
    (datasetCode === 'ds-hk-saanseoi-division' && resourceType === 'divisionArea')
  )
    return {
      ...common,
      expression: datasetCode.includes('saanseoi')
        ? 'sourceProperties copies source_properties when supplied; otherwise remove id, geometry and the transport-derived class/division_id/flags/source fields. sourceGeometry validates source_geometry ?? geometry as Polygon/MultiPolygon; select outputPath.'
        : 'Require publisher source_properties and retainSourceProperties; require source_geometry as Polygon/MultiPolygon; select outputPath. Canonical repaired geometry does not replace publisher evidence.',
      inputs: ['publisherRecord'],
      implementation: {
        path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
        symbol: 'sourceProperties',
      },
      additionalImplementations: [
        ...common.additionalImplementations,
        {
          path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
          symbol: 'sourceGeometry',
        },
      ],
    }
  return null
}
