import selection from '../../../fixtures/meta/processing-rules/assembly/landsd-settlement-selection.json'
import type { CurrentFieldRule } from './fieldLineageCurrentRules'
import { hierarchyProducer } from './fieldLineageHierarchyPreparation'
import type { ProducerSpecification } from './fieldLineageProducer'
import { nativeAdministrativeHierarchyFieldRule } from './fieldLineageNativeAdministrativeHierarchy'

const root = 'apps/harbour-cli/src/lib/'
const landsd = `${root}sources/hkgov/landsd/landsdPlaceName.ts`
const census = `${root}sources/hkgov/censtatd/hkgovCenstatdStatistics.ts`
const normaliser = 'libs/core/src/pipeline/services/divisions/division.ts'
export const HMA_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
export const LANDSD_DATASET = 'ds-hk-hkgov-landsd-division'
export function nativeDivisionProducer(
  dataset: string,
  resource: string,
  path: string,
): ProducerSpecification | null {
  const hma = dataset === HMA_DATASET
  if (
    (!hma && dataset !== LANDSD_DATASET) ||
    !['division', 'divisionArea'].includes(resource)
  )
    return null
  const implementation = {
    path: hma ? census : landsd,
    symbol: hma
      ? 'prepareHkgovCenstatdStatisticGeographyUploads'
      : 'landsdSettlementDivisionRows',
  }
  if (path === 'nativeInventory')
    return {
      inputs: ['sourceVersion'],
      reads: {
        archive: {
          stage: 'raw',
          collection: 'archive',
          path: hma ? 'HMA_21C.gml' : '$',
        },
      },
      implementation: {
        path: hma ? census : landsd,
        symbol: hma
          ? 'prepareHkgovCenstatdStatisticGeographyUploads'
          : 'readLandsdPlaceNameArchive',
      },
      expression: hma
        ? 'Read HMA_21C members with the statistic-property and GML-geometry parsers; require equal counts and correlate by member ordinal.'
        : 'Join GEO_PLACE_NAME to PLACE_NAME by required GEO_NAME_ID; correlate native and decoded geometry by that same unique identity.',
      steps: hma
        ? [
            'Keep BG_21C Building Groups source-only. Parse native EPSG:2326 polygons and project to WGS84; retain native sourceGeometry and publisher properties separately.',
            'code = trimmed properties.hma or trimmed featureId; require /^HMA\\d+$/i and uppercase for canonical identity. English name = trimmed hma_eng or original code; Traditional Chinese = trimmed hma_chi or English.',
            'divisionId = canonicalGeneratedId(UUIDv5(CANONICAL_DIVISION_ID_NAMESPACE, "CENSTATD:HMA:" + uppercaseCode)); reject duplicate Division IDs.',
            'sourceRecordId = "HMA_21C:" + featureId. Keep archive key/hash, layer and publisher properties in the source evidence.',
          ]
        : [
            'Require GEO_PLACE_NAME and PLACE_NAME layers, the expected 2,706 features, matching native/projected record counts and unique native identities.',
            'Require PLACE_CLASS and PLACE_TYPE, finite native Point coordinates and at least one Official name for every geometry record. NAME_STATUS must be Official or Alias.',
            'Recover publisher label bytes with Buffer.from(value, "latin1").toString("utf8"); retain null labels. Preserve related-name row order.',
            'Project native HK80 geometry with projectHk80Geometry. Keep native sourceGeometry and unmodified publisher properties alongside projected geometry.',
          ],
      additionalImplementations: hma
        ? [
            {
              path: `${root}sources/hkgov/censtatd/hkgovCenstatdGml.ts`,
              symbol: 'parseHkgovCenstatdDistrictGml',
            },
          ]
        : [{ path: `${root}sources/hkgov/hk1980.ts`, symbol: 'projectHk80Geometry' }],
    }
  if (!hma && path === 'nativeSelectedInventory')
    return {
      inputs: ['nativeInventory'],
      layer: 'conditional-rule',
      implementation: selection.implementation,
      expression:
        'Keep only PLACE_CLASS === parameters.includedClass (Settlement); retain all publisher records in SOURCE independently of selection.',
      parameters: selection.parameters,
      document: selection,
      steps: [
        'Count selected, Hydrographic, Topographic, missing-class and unexpected-class outcomes. This rule retains counts, not per-record decisions.',
      ],
    }
  if (path === 'nativePreparedRow')
    return {
      inputs: [hma ? 'nativeInventory' : 'nativeSelectedInventory'],
      reads: {
        identity: {
          stage: 'request',
          collection: 'selectedRecord',
          path: 'id',
          role: 'selection',
        },
      },
      implementation,
      expression:
        'Construct the native transport row and select the occurrence corresponding to the requested canonical identity.',
      steps: hma
        ? [
            'Division: id=divisionId; canonical_type=class=housing-market-area; canonical_level is absent; geometry is projected polygon; identifiers={hkgovCenstatd:{code:uppercaseCode}}.',
            'names.common contains en and zh-hant arrays; names.primary is English. parent_division_id and subtype are empty strings. source is hkgov-censtatd.',
            'Area: id="CENSTATD:housing-market-area:"+uppercaseCode; division_id=divisionId; class=land; same geometry, source_geometry, source_properties and provenance as Division.',
            'Parquet JSON-valued properties are decoded by the C&SD native Division normaliser and normaliseHkgovCenstatdInputRow for Area; the supplied division_id bypasses administrative identity mapping.',
          ]
        : [
            'id=canonicalGeometryId("division","hkgov-landsd",GEO_NAME_ID); identifiers={hkgovLandsd:{geoNameId}}; require a Point and non-empty publisher identity.',
            'Order all Official labels before all Alias labels, retaining order within each group; names.common.en and zh-hant include non-null publisher labels.',
            'Set source=hkgov-landsd, country=HK, subtype=locality, class=PLACE_TYPE and parent_division_id="". Native rows supply no hierarchy, cartography or wikidata.',
          ],
    }
  if (path === 'source')
    return {
      inputs: [],
      implementation,
      expression: hma
        ? '"hkgov-censtatd" (the selected processor source)'
        : '"hkgov-landsd" (the selected processor source)',
    }
  if (path === 'nativeVersionTimes')
    return {
      inputs: ['id', 'snapshotId'],
      reads: {
        version: {
          stage: 'canonical',
          collection: 'selectedDivisionVersion',
          path: 'createdAt,updatedAt',
          role: 'value',
        },
      },
      implementation: {
        path: `${root}pipeline/divisions/processLocalDivisionSqlUploadRows.ts`,
        symbol: 'buildDivisionCurrentSqlFile',
      },
      expression:
        'Read persisted timestamps from the exact Division content version selected by snapshot membership and identity.',
      steps: [
        'The native normaliser supplies createdAt and updatedAt from its materialisation clock; these are operational timestamps, not publisher dates.',
        'On a new (id,versionHash) insert use those timestamps. On conflict preserve createdAt and replace updatedAt. Unchanged versions bypass base insertion and retain their stored timestamps.',
        'The response reader selects current or history content for the requested snapshot; never recompute timestamps while explaining an existing release.',
      ],
      additionalImplementations: [
        { path: normaliser, symbol: 'normaliseDivisionRowInternal' },
        { path: 'apps/atlas-api/src/db/divisions.ts', symbol: 'createdAt' },
      ],
    }
  const fields = new Set([
    'id',
    'names',
    'geometry',
    'identifiers',
    'sources',
    'source',
    'canonical_type',
    'canonical_level',
    'class',
    'subtype',
    'admin_level',
    'parent_division_id',
    'hierarchies',
    'division_id',
    'district_class',
    'district_code',
  ])
  if (fields.has(path))
    return {
      inputs: ['nativePreparedRow'],
      implementation,
      expression: `Select ${path} from the ${resource} native prepared row; absent optional transport properties remain undefined.`,
    }
  if (
    !hma &&
    ['divisionBaselineI18n', 'divisionAliasI18n', 'divisionCuratedI18n'].includes(path)
  )
    return hierarchyProducer(path)
  if (path === 'nativeBaselineI18n')
    return hma
      ? {
          inputs: ['id', 'names'],
          implementation: { path: normaliser, symbol: 'normaliseDivisionI18n' },
          expression:
            'normaliseDivisionI18n(id, parseJsonRecord(names)); the C&SD branch bypasses Overture classification/name curations and patches.',
        }
      : {
          inputs: ['divisionCuratedI18n'],
          implementation: { path: normaliser, symbol: 'normaliseDivisionRowInternal' },
          expression:
            'Use the curated names after conditional aliases. applyDivisionClassificationPatch returns null for the LandsD source, so applyDivisionNamePatch passes them through.',
        }
  if (path === 'nativeTranslatedI18n')
    return {
      inputs: ['id', 'nativeBaselineI18n', 'datasetCode', 'sourceReleaseCode'],
      reads: {
        translations: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'division-translations',
        },
      },
      instructionSelector: { fixtureTypes: ['division-translations'] },
      layer: 'curation',
      audit: { category: 'curations', scope: 'individual', retention: 'decision' },
      implementation: {
        path: `${root}pipeline/divisions/processLocalDivisionSqlUploadTranslations.ts`,
        symbol: 'resolveDivisionNameTranslations',
      },
      expression:
        'Resolve translations for this dataset, source release and canonical identity; merge only absent locales other than zh-hans into the normalised rows.',
      steps: [
        'Use native baseline names as the exact translation inputs. These native rows have no parent hierarchy, so parent identity and parent-name context are null.',
        'Retain the exact translation instruction and application; missing required translations or inconsistent fixture inputs block preparation. No latest release fallback.',
        'mergeDivisionI18nTranslations preserves existing source locales and adds translated rows with name provenance. It never replaces the baseline name in an existing locale.',
      ],
      additionalImplementations: [
        {
          path: 'libs/core/src/pipeline/services/divisions/divisionTranslationRule.ts',
          symbol: 'divisionTranslationRule',
        },
      ],
    }
  if (path === 'nativeFinalI18n')
    return {
      inputs: ['nativeTranslatedI18n'],
      layer: 'conditional-rule',
      implementation: { path: normaliser, symbol: 'buildCanonicalDivisionApiI18n' },
      expression:
        'Apply declared API locale fallback branches only for missing locales, copy the selected source row and sort rows by locale. Retain branch counts.',
    }
  return null
}

export function nativeDivisionFieldRule(
  dataset: string,
  resource: string,
  field: string,
): CurrentFieldRule | null {
  if (![HMA_DATASET, LANDSD_DATASET].includes(dataset) || resource !== 'division')
    return null
  if (field === 'hierarchies') return nativeAdministrativeHierarchyFieldRule(dataset)
  const hma = dataset === HMA_DATASET
  const base: Record<string, [string, string[]]> = {
    id: ['Require native canonical id', ['id']],
    snapshotId: [
      'Selected release member snapshotId, preserved separately from physical serving scope',
      ['snapshotId'],
    ],
    createdAt: ['nativeVersionTimes.createdAt', ['nativeVersionTimes']],
    updatedAt: ['nativeVersionTimes.updatedAt', ['nativeVersionTimes']],
    class: [hma ? 'housing-market-area' : 'settlement', ['id']],
    level: [hma ? 'null' : '5', ['id']],
    category: [
      hma
        ? 'geographicDivisionClassification("housing-market-area")?.category ?? null'
        : 'geographicDivisionClassification("settlement")?.category ?? null',
      ['id'],
    ],
    geometry: [
      hma ? 'parseJsonGeometry(geometry)' : 'parseWkbGeometry(geometry)',
      ['geometry'],
    ],
    identifiers: ['canonicalIdentifiers(identifiers)', ['identifiers']],
    sources: [
      hma
        ? '{hkgovCenstatd: sources.map(reference => ({record_id: reference.sourceRecordId}))}; require non-empty record identities.'
        : '[{publisher: "hkgov-landsd", dataset: "ds-hk-hkgov-landsd-division", recordId: requirePublisherPlaceNameId(row)}]',
      hma ? ['sources'] : ['id'],
    ],
    hierarchies: [
      'emptyDivisionHierarchies(); native input supplies no ancestry',
      ['id'],
    ],
    cartography: [
      hma
        ? 'materialiseDivisionCartography("housing-market-area")'
        : 'materialiseDivisionCartography(class, "hkgov-landsd"); class is the native PLACE_TYPE, not the output settlement class.',
      hma ? ['canonical_type'] : ['class'],
    ],
    divisionCode: ['null', []],
    'relationships.areas': [
      'Join selected DivisionArea records by divisionId within this release and the requested variant.',
      ['id'],
    ],
    'relationships.boundaries': [
      'Join selected DivisionBoundary records by either endpoint within this release and the requested variant; no selected boundary snapshot yields no members.',
      ['id'],
    ],
  }
  const entry = /^i18n\.[^.]+\.(name|nameAlts|nameRules)$/.test(field)
    ? ([`Select ${field} from nativeFinalI18n`, ['nativeFinalI18n']] as [
        string,
        string[],
      ])
    : base[field]
  return entry
    ? {
        ...(field === 'cartography'
          ? {
              additionalImplementations: [
                {
                  path: 'libs/core/src/pipeline/services/divisions/divisionCartography.ts',
                  symbol: 'normaliseDivisionCartography',
                },
                {
                  path: 'libs/db/src/divisionCartography.ts',
                  symbol: 'materialiseDivisionCartography',
                },
              ],
            }
          : {}),
        expression: entry[0],
        inputs: entry[1],
        implementation: {
          path: normaliser,
          symbol: hma
            ? 'normaliseHkgovCenstatdStatisticDivisionRow'
            : 'normaliseDivisionRowInternal',
        },
      }
    : null
}
