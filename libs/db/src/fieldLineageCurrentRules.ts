import { nativeDivisionFieldRule } from './fieldLineageNativeDivisions'
import { geometryReferenceRule } from './fieldLineageGeometryReferences'
import { planningDivisionFieldRule } from './fieldLineagePlanningRules'

/** Field-specific current executor contracts. Expressions use names from their implementation. */
export type CurrentFieldRule = {
  expression: string
  inputs: string[]
  implementation: { path: string; symbol: string }
  additionalImplementations?: Array<{ path: string; symbol: string }>
  guards?: string[]
  steps?: string[]
}
const address = 'libs/core/src/pipeline/services/addresses/normalisation.ts'
const statistic =
  'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts'
const place = 'libs/core/src/pipeline/services/places/place.ts'
const division = 'libs/core/src/pipeline/services/divisions/division.ts'
const geometry = 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts'
const rule = (
  path: string,
  symbol: string,
  expression: string,
  inputs: string[],
  extra: Partial<CurrentFieldRule> = {},
): CurrentFieldRule => ({
  expression,
  inputs,
  implementation: { path, symbol },
  ...extra,
})

export function currentStatisticFieldRule(
  resource: string,
  apiField: string,
): CurrentFieldRule | null {
  const field = apiField.replace(/^attributes\./, '')
  if (resource === 'statistic-field') {
    const expressions: Record<string, string> = {
      aggregation: "metadata?.aggregation ?? 'unreviewed'",
      aggregationPercentile: 'metadata?.aggregationPercentile ?? null',
      comparability: 'metadata?.comparability ?? null',
      datasetCode: 'row.datasetCode',
      denominatorFieldName: 'metadata?.denominatorFieldName ?? null',
      dimensions: 'metadata?.dimensions ?? {}',
      fieldName: 'metadata?.fieldName ?? sourceField',
      measureCode: 'metadata?.measureCode ?? fieldName',
      periodicity: 'metadata?.periodicity ?? null',
      sourceField: 'sourceField',
      sourceNullOption: 'metadata?.sourceNullOption ?? null',
      statisticKind: "metadata?.statisticKind ?? 'unreviewed'",
      unitCode: 'metadata?.unitCode ?? unitFor(row.datasetCode, sourceField)',
      valueKind:
        'field.valueKind from the completed dataset/field definition fold; any accepted numeric or non-published observation, or reviewed field metadata, makes the final field numeric.',
      i18n: "metadata?.localisations ?? [{ description: null, isTranslationVerified: true, locale: 'en', name: sourceField }]",
    }
    if (field === 'versionHash')
      return rule(
        'apps/harbour-cli/src/lib/pipeline/statistics/statisticsRecordIdentity.ts',
        'versionStatisticsDefinitions',
        'hashStatisticContent({ field: definition(field), localisations: localisations(fieldsI18n, datasetCode, "fieldName", fieldName), measureVersionHash })',
        ['field', 'fieldsI18n', 'measures', 'measuresI18n'],
        {
          steps: [
            'definition removes createdAt, updatedAt, validFrom, validTo, isCurrent, sourceReleaseId, sourceFeatureRef, versionHash and measureVersionHash.',
            'For each measure, filter localisations by datasetCode/measureCode, remove assertion columns, sort by locale, then hash {measure: definition(measure), localisations}.',
            'Resolve the required measureVersionHash using datasetCode + U+0000 + field.measureCode; reject missing measures.',
            'Filter field localisations by datasetCode/fieldName, remove assertion columns, sort by locale, then hash the object whose exact keys are field, localisations and measureVersionHash.',
            'hashStatisticContent applies recordContent, stableJsonStringify and SHA-256, returning the hexadecimal digest.',
          ],
        },
      )
    if (expressions[field])
      return rule(
        statistic,
        'normaliseHkgovCenstatdStatistics',
        expressions[field]!,
        field === 'datasetCode'
          ? ['datasetCode']
          : field === 'sourceField'
            ? ['sourceField']
            : field === 'valueKind'
              ? ['field']
              : field === 'unitCode'
                ? ['datasetCode', 'sourceField', 'fieldMetadata']
                : ['datasetCode', 'sourceField', 'fieldMetadata'],
        {
          guards: [
            'Reject two publisher fields producing the same dataset/field identity.',
            'Require referenced reviewed measures when a measure registry is supplied.',
          ],
          steps: [
            'Resolve fieldMetadata using datasetCode and sourceField.',
            'Parse each non-identifier, non-null publisher literal.',
            'Apply field localisations through statisticLocalisationRule; do not infer translation origin from verification.',
          ],
        },
      )
  }
  if (resource !== 'statistic') return null
  if (
    [
      'id',
      'datasetCode',
      'sourceReleaseId',
      'sourceFeatureRef',
      'geography',
      'fieldDefinitionHashes',
      'fieldSources',
      'relationships.division',
    ].includes(field) ||
    field.startsWith('referencePeriod.')
  ) {
    const key =
      field === 'relationships.division'
        ? 'divisionId'
        : field.startsWith('referencePeriod.')
          ? (
              {
                code: 'referencePeriodCode',
                start: 'referencePeriodStart',
                end: 'referencePeriodEnd',
                endYear: 'referencePeriodEndYear',
                granularity: 'referencePeriodGranularity',
              } as Record<string, string>
            )[field.slice('referencePeriod.'.length)]
          : field
    if (key)
      return rule(statistic, 'normaliseStatistics', `packedRecord.${key}`, [
        'packedRecord',
      ])
  }
  if (field === 'comparability')
    return rule(
      'apps/atlas-api/src/services/statistics.ts',
      'createStatisticResource',
      'For each key in packedRecord.values, look up the exact datasetCode + U+0000 + fieldName + U+0000 + packedRecord.fieldDefinitionHashes[fieldName]. Include only definitions with a truthy comparability value; omit the whole comparability property when the resulting map is empty.',
      ['packedRecord', 'retainedFieldDefinitions'],
    )
  return null
}

export function currentAddressFieldRule(
  apiField: string,
  datasetCode = 'ds-hk-hkgov-dpo-address',
): CurrentFieldRule | null {
  const field = apiField.replace(/^attributes\./, '')
  if (datasetCode.includes('overture')) {
    const localised = /^i18n\.[^.]+\.(.+)$/.exec(field)
    const expressions: Record<string, [string, string[]]> = {
      id: ['entry.addressId', ['resolutions']],
      i18n: [
        'entry.values.map(({provenance, ...value}) => ({...value, addressId: id}))',
        ['resolutions'],
      ],
      geometry: ['null', []],
      bbox: ['null', []],
      parentAddressId: ['null', []],
      granularity: [
        'establishAddressGranularity({addressId: id, values: entry.values, sourceVersion}).granularity',
        ['resolutions', 'sourceVersion'],
      ],
      'identifiers.ALS:CsuId': [
        'undefined: supplementary identities use SS:supplementaryIdentityKey',
        [],
      ],
      sources: [
        'Group accepted entries by addressId; retain each publisher occurrence, acceptance mode, policy version and selected ALS base evidence.',
        ['resolutions', 'officialAddresses', 'sourceReleaseId', 'placeSourceReleaseId'],
      ],
      'relationships.divisions': [
        'Copy ADDRESS_DIVISION_FIELDS from the selected ALS base, or null per field when no base exists.',
        ['resolutions', 'officialAddresses'],
      ],
    }
    const selected = localised
      ? ([
          `entry.values.find(value => value.locale === selectedLocale)?.${localised[1]}`,
          ['resolutions'],
        ] as [string, string[]])
      : expressions[field]
    return selected
      ? rule(
          'apps/harbour-cli/src/lib/pipeline/places/supplementaryPlaceAddressRows.ts',
          'buildSupplementaryAddressRows',
          selected[0],
          selected[1],
          {
            guards: [
              'Only accepted supplementary resolutions materialise.',
              'Reject conflicting values or baseAddressId within one addressId group.',
              'A declared ALS base must exist in the selected companion snapshot.',
            ],
          },
        )
      : null
  }
  const locale = /^i18n\.(en|zh-hant)\.(.+)$/.exec(field)
  if (locale) {
    const prefix = locale[1] === 'en' ? 'en' : 'zhHant',
      name = locale[2]!
    const simple: Record<string, string> = {
      formattedAddress: 'FormattedAddress',
      buildingName: 'BuildingName',
      estateName: 'EstateName',
      streetName: 'StreetName',
    }
    if (simple[name])
      return rule(
        address,
        'normalisePreparedHkgovAddressRow',
        name === 'formattedAddress'
          ? `requireText(row.${prefix}FormattedAddress)`
          : `asNonEmptyString(row.${prefix}${simple[name]})`,
        [`${prefix}FormattedAddress`, `${prefix}${simple[name]}`],
        {
          guards: [
            `Emit the ${locale[1]} row only when ${prefix}FormattedAddress is non-empty.`,
          ],
        },
      )
    if (name === 'buildingNumberConnector')
      return rule(address, 'normalisePreparedHkgovAddressRow', 'null', [])
    if (name.startsWith('buildingNumber'))
      return rule(
        address,
        'getBuildingNumberComponents',
        `getBuildingNumberComponents(row, ${JSON.stringify(locale[1])}).${name.slice('buildingNumber'.length).toLowerCase()}`,
        [
          `${prefix}StreetName`,
          `${prefix}StreetNumberFrom`,
          `${prefix}StreetNumberTo`,
          `${prefix}VillageNumberFrom`,
          `${prefix}VillageNumberTo`,
        ],
        {
          steps: [
            'Use street numbers when streetName is non-empty; otherwise village numbers.',
            'Trim string components; empty becomes null.',
            'Expression is from when from exists and to is absent or equal; otherwise null.',
          ],
        },
      )
    if (name.startsWith('block'))
      return rule(
        address,
        'normaliseBlockFields',
        `normaliseBlockFields(row.${prefix}BlockDescriptor, row.${prefix}BlockNumber, ${JSON.stringify(locale[1])}).${name}`,
        [`${prefix}BlockDescriptor`, `${prefix}BlockNumber`],
        {
          steps: [
            'Classify the trimmed descriptor with normaliseBlockDescriptor.',
            'English expression joins descriptor and reference with a space; Chinese joins reference and descriptor.',
            'blockTypeBeforeNumber is locale == en when both descriptor and reference exist, otherwise null.',
          ],
        },
      )
    if (name.startsWith('phase'))
      return rule(
        address,
        'normalisePhaseFields',
        `normalisePhaseFields(getPreparedPhaseFields(row, ${JSON.stringify(locale[1])}).name, getPreparedPhaseFields(row, ${JSON.stringify(locale[1])}).ref).${name}`,
        [
          `${prefix}PhaseName`,
          `${prefix}PhaseRef`,
          locale[1] === 'en' ? 'engPremisesAddressJson' : 'chiPremisesAddressJson',
        ],
        {
          steps: [
            'Prepared phase components take precedence over publisher JSON phase fields.',
            'Recognise phase suffixes and compatible numeric/Roman references with splitPhaseNameReference.',
            'Return the normalised phaseName and phaseRef; phaseExpression is [phaseName, phaseRef].filter(Boolean).join(" ") || null.',
          ],
        },
      )
  }
  const expressions: Record<string, string> = {
    id: 'requireText(row.canonicalId ?? row.id)',
    geometry: 'parseOptionalJson(row.geometry)',
    parentAddressId: 'asNonEmptyString(row.parentAddressId)',
    granularity:
      "row.hierarchyCuration && ['complex','phase','building','section','unit'].includes(row.curatedGranularity) ? row.curatedGranularity : establishAddressGranularity({addressId: canonicalId, values: i18n, sourceVersion, componentCorrections}).granularity",
    'identifiers.ALS:CsuId': "canonicalIdentifiers(row.identifiers)?.['ALS:CsuId']",
    sources: 'addressSourceReferences(row, canonicalId)',
    i18n: 'Normalise the en and zh-hant component rows independently, keyed by locale.',
    'relationships.divisions':
      'Materialise divisionRelationships from the selected Division scope, retaining divisionId and role for each relationship.',
  }
  return expressions[field]
    ? rule(
        address,
        'normalisePreparedHkgovAddressRow',
        expressions[field]!,
        (
          {
            id: ['canonicalId', 'id'],
            geometry: ['geometry'],
            parentAddressId: ['parentAddressId'],
            granularity: [
              'canonicalId',
              'hierarchyCuration',
              'curatedGranularity',
              'i18n',
              'sourceVersion',
              'componentCorrections',
            ],
            'identifiers.ALS:CsuId': ['identifiers'],
            sources: ['publisherSource', 'canonicalId', 'id'],
            i18n: ['enFormattedAddress', 'zhHantFormattedAddress'],
            'relationships.divisions': ['divisionSnapshotId', 'divisionRelationships'],
          } as Record<string, string[]>
        )[field]!,
        {
          steps: [
            'Prepared ALS rows already include reviewed component corrections and hierarchy decisions.',
            'Preserve the selected Division snapshot and canonical identity.',
          ],
        },
      )
    : null
}

export function currentPlaceFieldRule(apiField: string): CurrentFieldRule | null {
  const field = apiField.replace(/^attributes\./, '')
  const locale = /^i18n\.[^.]+\.(.+)$/.exec(field)
  if (locale) {
    const expressions: Record<string, string> = {
      name: 'namesForLocale[0]?.value ?? null',
      nameAlts: 'joinAlternates(namesForLocale)',
      nameVariant:
        'namesForLocale.length > 1 ? namesForLocale.slice(1).map(value => value.value) : null',
      brandName: 'brandForLocale[0]?.value ?? null',
      brandNameAlts: 'joinAlternates(brandForLocale)',
      brandNameVariant:
        'brandForLocale.length > 1 ? brandForLocale.slice(1).map(value => value.value) : null',
      freeformAddress: 'addressesForLocale[0]?.value ?? null',
      provenance:
        '{ isMachineTranslated: [], isHumanVerified: [], isLocaleInferred: valuesForLocale.some(value => value.inferred) }',
      accessHint: 'selectedLocale.accessHint ?? null',
    }
    if (expressions[locale[1]!])
      return rule(
        place,
        'mergePlaceI18n',
        expressions[locale[1]!]!,
        locale[1] === 'provenance'
          ? ['names', 'brand.names', 'addresses']
          : locale[1] === 'freeformAddress'
            ? ['addresses']
            : locale[1] === 'accessHint'
              ? ['accessHint']
              : locale[1]!.startsWith('brand')
                ? ['brand.names']
                : ['names'],
        {
          steps: [
            'namedValues resolves publisher locale keys and infers locale from script when needed; retain conflicts as guards.',
            'Group normalised names, brand names and freeform addresses by locale.',
            'The current upload does not invoke the standalone Place translation resolver; it does not populate accessHint.',
          ],
        },
      )
  }
  const expressions: Record<string, string> = {
    id: 'asString(row.id)',
    basicCategory:
      'asString(row.basic_category) ?? asString(row.basicCategory) ?? taxonomyPrimary',
    'taxonomy.primary': 'asString(taxonomy?.primary) ?? asString(categories?.primary)',
    'taxonomy.alternates':
      'jsonValue(categories?.alternate ?? taxonomy?.alternates ?? taxonomy?.alternate)',
    geometry: "{ type: 'Point', coordinates: [lng, lat] }",
    sources: '{ overture: asArray(row.sources) }',
    firstSeenMonth:
      'Preserve the existing identity firstSeenMonth; for a new identity use sourceVersion.slice(0, 7).',
    lastSeenMonth: 'The completed selected publication cohortKey.slice(0, 7).',
    referenceName:
      'Traditional Chinese name, followed by a distinct non-Han English name when appropriate; else English; else first non-empty locale; else null.',
    createdAt:
      'Preserve the creation timestamp for an existing identity; otherwise use materialisation time.',
    updatedAt:
      'The timestamp assigned by the canonical content-change materialisation.',
    snapshotId: 'Selected canonical snapshot id.',
    resourceReleaseId: 'Selected resource release id.',
    addressSnapshotId:
      'Selected companion Address snapshot for the accepted address association.',
    address2dId:
      'Accepted canonical Address2D identity after normalised multilingual address matching and reviewed overrides.',
    address3dId: 'Accepted Address3D association for the selected Address2D identity.',
    address3dUnitId: 'Selected matching unit identity, or null.',
    address3dMembership:
      'Selected unit membership from the matched Address3D structure, or null.',
    'relationships.address':
      'address2dId ? { type: "addresses", id: address2dId } : null',
    'relationships.divisions':
      'Canonical divisionIds for the accepted Place/Address association, in reader order.',
  }
  if (!expressions[field]) return null
  if (field === 'geometry')
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
      'buildPlaceSql',
      "{ type: 'Point', coordinates: effectiveCoordinates }",
      ['effectiveCoordinates'],
      {
        steps: [
          'Use resolution coordinates when present, falling back independently to normalised publisher longitude and latitude.',
        ],
      },
    )
  if (field === 'addressSnapshotId')
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
      'buildPlaceSql',
      'address2dId ? (previousIdentity?.row.address2dId === address2dId && previousIdentity.row.addressDependencyHash === addressDependencyHash ? previousIdentity.row.addressSnapshotId : selectedAddressSnapshotId) : null',
      [
        'address2dId',
        'previousIdentity',
        'addressDependencyHash',
        'selectedAddressSnapshotId',
      ],
    )
  if (field === 'sources')
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
      'buildPlaceSql',
      'previousIdentity?.row.versionHash === contentHash ? (previousIdentity.row.sources ?? resolvedSources) : resolvedSources',
      ['place', 'divisionAssociation', 'previousIdentity', 'contentHash'],
      {
        steps: [
          'resolvedSources merges place.sources with divisionAssociation when present.',
        ],
      },
    )
  if (
    [
      'addressSnapshotId',
      'address2dId',
      'address3dId',
      'address3dUnitId',
      'address3dMembership',
      'relationships.divisions',
    ].includes(field)
  )
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadPreparation.ts',
      'stageEnrichedPlaces',
      field === 'relationships.divisions'
        ? '[...new Set(divisionMembership.divisionIds)]'
        : field.startsWith('address3d')
          ? `unitReference?.${field} ?? null`
          : 'address2dId',
      field === 'relationships.divisions'
        ? ['divisionMembership']
        : field.startsWith('address3d')
          ? ['unitReference']
          : field === 'address2dId'
            ? ['address2dId']
            : ['address2dId'],
      {
        guards: [
          'Reject unresolved review, missing accepted Address rows and incomplete companion publication receipts.',
        ],
        steps: [
          'Select the supplementary Address snapshot for supplementary resolutions; otherwise the selected official Address snapshot.',
          'Resolve Division membership at effective coordinates with Address fallback.',
          'Resolve Address3D only for an accepted non-supplementary Address.',
          'For addressSnapshotId, buildPlaceSql preserves the predecessor snapshot when address2dId and addressDependencyHash are unchanged; otherwise it uses the newly selected companion. With no address2dId it stores null.',
        ],
      },
    )
  if (field === 'firstSeenMonth')
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
      'buildPlaceSql',
      'typeof previous?.row.firstSeenMonth === "string" ? previous.row.firstSeenMonth : place.firstSeenMonth',
      ['previousIdentity', 'sourceVersion'],
    )
  if (field === 'lastSeenMonth')
    return rule(
      'apps/atlas-api/src/services/places.ts',
      'withPlacePublication',
      'cohortKey.slice(0, 7)',
      ['publication.cohortKey'],
    )
  if (['createdAt', 'updatedAt'].includes(field))
    return rule(
      'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
      'buildPlaceSql',
      'now assigned by buildPlaceSql to the materialised row; unchanged rows may reuse existing content through the selected publication.',
      ['materialisationTime', 'previousContentHash', 'contentHash'],
    )
  return rule(
    place,
    field === 'referenceName'
      ? 'composePlaceReferenceName'
      : 'normaliseOverturePlaceInternal',
    expressions[field]!,
    (
      {
        id: ['id'],
        basicCategory: [
          'basic_category',
          'basicCategory',
          'taxonomy.primary',
          'categories.primary',
        ],
        'taxonomy.primary': ['taxonomy.primary', 'categories.primary'],
        'taxonomy.alternates': [
          'categories.alternate',
          'taxonomy.alternates',
          'taxonomy.alternate',
        ],
        geometry: ['geometry'],
        sources: ['sources'],
        firstSeenMonth: ['sourceVersion', 'previousIdentity'],
        lastSeenMonth: ['publication.cohortKey'],
        referenceName: ['i18n'],
        createdAt: ['previousIdentity', 'materialisationTime'],
        updatedAt: ['contentHash', 'previousIdentity', 'materialisationTime'],
        snapshotId: ['snapshotId'],
        resourceReleaseId: ['resourceReleaseId'],
        addressSnapshotId: ['addressResolution'],
        address2dId: ['addressResolution'],
        address3dId: ['unitReference'],
        address3dUnitId: ['unitReference'],
        address3dMembership: ['unitReference'],
        'relationships.address': ['address2dId'],
        'relationships.divisions': ['divisionIds'],
      } as Record<string, string[]>
    )[field]!,
    {
      guards: ['A Place without a non-empty id or valid Point coordinates is omitted.'],
    },
  )
}

export function currentDivisionFieldRule(
  resource: string,
  apiField: string,
  datasetCode: string,
): CurrentFieldRule | null {
  const field = apiField.replace(/^attributes\./, '')
  const native = nativeDivisionFieldRule(datasetCode, resource, field)
  if (native) return native
  if (resource === 'divisionArea' || resource === 'divisionBoundary') {
    const reference = geometryReferenceRule(field, datasetCode)
    if (reference) return reference
    const expressions: Record<string, string> = {
      id:
        resource === 'divisionArea'
          ? "source === 'saanseoi' ? id : canonicalGeometryId('divisionArea', source, id)"
          : "canonicalGeometryId('divisionBoundary', source, id)",
      bbox: 'calculateGeoJsonBbox(requireGeometry(row.geometry, allowedTypes, id, options.validateGeometry))',
      geometry:
        'withoutEmbeddedBbox(requireGeometry(row.geometry, allowedTypes, id, options.validateGeometry))',
      divisionId: 'asNonEmptyString(row.division_id)',
      leftDivisionId: 'normaliseDivisionIds(row.division_ids, id)[0]',
      rightDivisionId: 'normaliseDivisionIds(row.division_ids, id)[1]',
      identifiers: 'canonicalIdentifiers(buildIdentifiers(row, source))',
      sources: 'geometrySourceReferences(row, source, canonicalId)',
      variant: 'options.variant ?? source',
      snapshotId:
        'Selected release member snapshotId, not an inferred latest snapshot.',
    }
    return expressions[field]
      ? rule(
          geometry,
          resource === 'divisionArea'
            ? 'normaliseDivisionAreaGeometry'
            : 'normaliseDivisionBoundaryGeometry',
          expressions[field]!,
          (
            {
              id: ['id', 'source'],
              bbox: ['geometry'],
              geometry: ['geometry'],
              divisionId: ['division_id'],
              leftDivisionId: ['division_ids'],
              rightDivisionId: ['division_ids'],
              identifiers: ['identifiers', 'id', 'source'],
              sources: ['sources', 'id', 'source'],
              variant: ['variant', 'source'],
              snapshotId: ['snapshotId'],
            } as Record<string, string[]>
          )[field]!,
          {
            guards: [
              'Apply configured geometry exclusions before materialisation.',
              'Require supported geometry and identities; failed validity guards block ingestion.',
              ...(resource === 'divisionBoundary'
                ? [
                    'Boundary division_ids must contain exactly two distinct non-empty identities; perspectives must be absent.',
                  ]
                : [
                    'Require a non-empty division_id. SaanSeoi archive areas bypass configured exclusions.',
                  ]),
            ],
          },
        )
      : null
  }
  if (resource !== 'division') return null
  if (datasetCode.startsWith('ds-hk-hkgov-pland-')) {
    const planning = planningDivisionFieldRule(field)
    if (planning) return planning
  }
  if (
    datasetCode === 'ds-hk-saanseoi-division' &&
    !field.startsWith('relationships.') &&
    ([
      'id',
      'level',
      'category',
      'class',
      'geometry',
      'bbox',
      'cartography',
      'identifiers',
      'identifiers.wikidata.id',
      'sources',
      'hierarchies',
    ].includes(field) ||
      /^i18n\.[^.]+\.(name|nameAlts|nameRules|nameVariant)$/.test(field))
  )
    return rule(
      'libs/core/src/pipeline/services/divisions/curatedDivision.ts',
      'normaliseCuratedDivision',
      ['level', 'category'].includes(field)
        ? `geographicDivisionClassification(record.class).${field}`
        : `Select ${field} from the parsed reviewed record; names are materialised as locale-keyed rows.`,
      ['record'],
      {
        guards: [
          'Require matching record.id and a recognised class.',
          'Supplied level/category must agree with the taxonomy.',
          'Names must be keyed by locale and full ancestry must be an array.',
        ],
        steps: [
          'Parse JSON-valued geometry, bbox, cartography, identifiers, sources and hierarchy fields.',
          'Import the reviewed archive without reapplying upstream curations or patches.',
        ],
      },
    )
  if (datasetCode.includes('censtatd') && !field.startsWith('relationships.')) {
    const native: Record<string, [string, string[]]> = {
      id: ['asNonEmptyString(row.id)', ['id']],
      class: ['asNonEmptyString(row.canonical_type)', ['canonical_type']],
      level: ['asOptionalInteger(row.canonical_level)', ['canonical_level']],
      category: [
        'geographicDivisionClassification(type)?.category ?? null',
        ['canonical_type'],
      ],
      geometry: ['parseJsonGeometry(row.geometry, "geometry")', ['geometry']],
      bbox: [
        'calculateGeoJsonBbox(parseJsonGeometry(row.geometry, "geometry"))',
        ['geometry'],
      ],
      identifiers: ['canonicalIdentifiers(row.identifiers)', ['identifiers']],
      sources: [
        '{hkgovCenstatd: parseJsonValue(row.sources, "sources").map(reference => ({record_id: requireNonEmpty(reference.sourceRecordId)}))}',
        ['sources'],
      ],
      hierarchies: ['emptyDivisionHierarchies()', []],
    }
    const name = /^i18n\.[^.]+\.(name|nameAlts|nameRules|nameVariant)$/.exec(field)
    const selected = name
      ? ([
          `normaliseDivisionI18n(id, parseJsonRecord(row.names, "names")); select ${field}`,
          ['id', 'names'],
        ] as [string, string[]])
      : native[field]
    if (selected)
      return rule(
        division,
        'normaliseHkgovCenstatdStatisticDivisionRow',
        selected[0],
        selected[1],
        {
          guards: [
            'Require id, canonical_type and canonical_level except nullable housing-market-area level.',
            'Require valid JSON geometry and non-empty source reference identities.',
          ],
        },
      )
  }
  const locale = /^i18n\.[^.]+\.(name|nameAlts|nameRules|nameVariant)$/.exec(field)
  const expressions: Record<string, string> = {
    id: 'asNonEmptyString(row.id)',
    class:
      "row.source === 'hkgov-landsd' ? 'settlement' : resolveDivisionClass({ row, otClass, otSubtype, parentDivisionId })",
    level:
      "row.source === 'hkgov-landsd' ? 5 : resolveDivisionLevel({ row, otClass, otSubtype, parentDivisionId })",
    category:
      'geographicDivisionClassification(resolveDivisionClass({ row, otClass, otSubtype, parentDivisionId }))?.category ?? null; specific classification curations and patches are separate candidates.',
    bbox: 'normalisedGeometry ? calculateGeoJsonBbox(normalisedGeometry) : null',
    geometry: 'parseWkbGeometry(row.geometry)',
    identifiers: 'divisionIdentifiersWithWikidata(row.identifiers, row.wikidata)',
    'identifiers.wikidata.id':
      'divisionIdentifiersWithWikidata(row.identifiers, row.wikidata)?.wikidata?.id',
    sources:
      'Native evidence is { evidence: [{ record_id: id }] }; otherwise normaliseOvertureSources(row.sources).',
    hierarchies:
      'normaliseDivisionHierarchies → enrich each correlated path with its recognised HK area → materialiseDivisionHierarchies; retain full correlated paths and category projections.',
    'relationships.areas':
      'Selected divisionArea records whose divisionId matches division.id, constrained by requested variants and release membership.',
    'relationships.boundaries':
      'Selected divisionBoundary records whose leftDivisionId or rightDivisionId matches division.id, constrained by requested variants and release membership.',
  }
  if (locale)
    return rule(
      division,
      'normaliseDivisionI18n',
      `normaliseDivisionI18n(id, row.names); select locale.${locale[1]}`,
      ['id', 'names'],
      {
        steps: [
          'Resolve publisher common/primary/rule names and locale fallback using the registered normalisation parameters.',
          'Keep primary names, alternate names, variants and name rules as separate outputs.',
          'Curation and patch outputs are separate candidates in the resolution group.',
        ],
      },
    )
  return expressions[field]
    ? rule(
        division,
        'normaliseDivisionRowInternal',
        expressions[field]!,
        (
          {
            id: ['id'],
            class: [
              'id',
              'class',
              'subtype',
              'admin_level',
              'parent_division_id',
              'source',
            ],
            level: [
              'id',
              'class',
              'subtype',
              'admin_level',
              'parent_division_id',
              'source',
            ],
            category: [
              'id',
              'class',
              'subtype',
              'admin_level',
              'parent_division_id',
              'source',
            ],
            bbox: ['geometry'],
            geometry: ['geometry'],
            identifiers: ['identifiers', 'wikidata'],
            'identifiers.wikidata.id': ['identifiers', 'wikidata'],
            sources: ['id', 'source', 'sources'],
            hierarchies: [
              'id',
              'hierarchies',
              'effectiveClass',
              'effectiveLevel',
              'effectiveI18n',
              'hierarchyLookup',
            ],
            'relationships.areas': ['id'],
            'relationships.boundaries': ['id'],
          } as Record<string, string[]>
        )[field]!,
        {
          steps: [
            'Dispatch SaanSeoi archive and C&SD native rows before Overture/native normalisation.',
            'Resolve hierarchy references using the selected snapshot lookup.',
            'Apply effective classification and hierarchy guards.',
          ],
        },
      )
    : null
}

export function currentFieldRule(
  resource: string,
  apiField: string,
  datasetCode: string,
): CurrentFieldRule | null {
  return (
    currentStatisticFieldRule(resource, apiField) ??
    (resource === 'address' ? currentAddressFieldRule(apiField, datasetCode) : null) ??
    (resource === 'place' ? currentPlaceFieldRule(apiField) : null) ??
    currentDivisionFieldRule(resource, apiField, datasetCode)
  )
}
