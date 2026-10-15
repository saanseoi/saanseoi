import { placeDivisionFieldNames } from './schema/shared'
import catalogue from '../../../fixtures/meta/fieldLineage/operations.json'
import type { Condition, Node, Operation } from './fieldLineageTypes'

type RetainOperation = (
  code: string,
  specification: Record<string, unknown>,
  inputs: Node['inputs'],
) => Operation

/** Only reviewed serializer paths become projection rules. An implicit mapping is not proof. */
export function compileResponseField(args: {
  apiVersion: string
  resourceType: string
  apiField: string
  inputs: Node['inputs']
  operation: RetainOperation
}): { operation: Operation; when: Condition; onAbsent: Node['onAbsent'] } {
  const { resourceType, apiField, inputs, operation } = args
  const unknown = (reason: string) => ({
    operation: { kind: 'unresolved' as const, reason, definitionIds: [] },
    when: { kind: 'unresolved' as const, reason },
    onAbsent: 'error' as const,
  })
  const profile = () => {
    inputs.profile = {
      stage: 'request',
      scope: 'request',
      collection: 'routeState',
      path: 'profile',
      role: 'selection',
    }
  }
  const localisationCondition = (
    profileCondition: Condition,
    apiField: string,
  ): Condition => {
    const locale = /^attributes\.i18n\.([^.]+)\./.exec(apiField)?.[1]
    if (!locale) return profileCondition
    inputs.selectedLocaleRow = {
      stage: 'request',
      scope: 'request',
      collection: 'selectedRecord',
      path: `i18n.${locale}`,
      role: 'selection',
    }
    return {
      kind: 'all',
      conditions: [
        profileCondition,
        { kind: 'compare', input: 'selectedLocaleRow', operator: 'exists' },
      ],
    }
  }
  if (
    /^api-divisions-v0\.[12]$/.test(args.apiVersion) &&
    ['division', 'divisionArea', 'divisionBoundary'].includes(resourceType)
  ) {
    const policy = catalogue.operations['division-response-field']
    const locale =
      /^attributes\.i18n\.([^.]+)\.(name|nameAlts|nameRules|nameVariant)$/.exec(
        apiField,
      )
    const direct =
      resourceType === 'division'
        ? [
            'id',
            'attributes.level',
            'attributes.class',
            'attributes.category',
            'attributes.hierarchies',
            'attributes.divisionCode',
            'attributes.createdAt',
            'attributes.updatedAt',
            'attributes.geometry',
            'attributes.cartography',
            'attributes.snapshotId',
            'attributes.sources',
            'attributes.identifiers',
          ]
        : [
            'id',
            'attributes.bbox',
            'attributes.type',
            'attributes.isLand',
            'attributes.isTerritorial',
            'attributes.sources',
            'attributes.snapshotId',
            'attributes.identifiers',
            'attributes.variant',
            'attributes.geometry',
            ...(resourceType === 'divisionArea'
              ? ['attributes.divisionId']
              : ['attributes.leftDivisionId', 'attributes.rightDivisionId']),
          ]
    if (resourceType === 'division')
      direct.push('relationships.areas', 'relationships.boundaries')
    if (
      !direct.includes(apiField) &&
      !(
        resourceType === 'division' &&
        (locale || apiField === 'attributes.identifiers.wikidata.id')
      )
    )
      return unknown(`No reviewed Division projection for ${apiField}.`)
    profile()
    const profiles = (
      policy.profiles[resourceType as keyof typeof policy.profiles] as Record<
        string,
        string[]
      >
    )[apiField]
    let when: Condition = profiles
      ? { kind: 'compare', input: 'profile', operator: 'in', value: profiles }
      : { kind: 'always' }
    const specification: Record<string, unknown> = { ...policy, resourceType, apiField }
    if (locale) {
      inputs.localeSelection = {
        stage: 'request',
        scope: 'request',
        collection: 'routeState',
        path: 'localeSelection',
        role: 'selection',
      }
      specification.localeKey = locale[1]
      specification.localeField = locale[2]
    }
    // The retained predicate specifies locale-row existence and truthy divisionCode,
    // which cannot be replaced by unconditional emission or a profile check alone.
    if (apiField.startsWith('relationships.')) {
      inputs.selectedGeometry = {
        stage: 'registry',
        scope: 'registry',
        collection: 'selectedGeometry',
        path: apiField.slice('relationships.'.length),
        role: 'value',
      }
      specification.relationship = {
        expression:
          'Map selected records to { type, id }; emit only when the corresponding areas/boundaries argument is supplied. An empty supplied array emits an empty data array.',
        scope: 'selected release membership and requested variant',
        cardinality: 'many',
        onEmpty: 'empty-array',
      }
    }
    const rule = operation('division-response-field', specification, inputs)
    if (rule.kind !== 'resolver')
      throw new Error('Expected retained response operation.')
    if (
      locale ||
      apiField === 'attributes.divisionCode' ||
      apiField.startsWith('relationships.')
    )
      when = {
        kind: 'predicate',
        definition: { ...rule.definition, branchId: 'emission' },
        arguments: Object.fromEntries(Object.keys(inputs).map(name => [name, name])),
      }
    if (locale?.[2] === 'nameVariant') when = { kind: 'any', conditions: [] }
    return {
      operation: rule,
      when,
      onAbsent: locale || apiField === 'attributes.divisionCode' ? 'omit' : 'null',
    }
  }
  if (args.apiVersion === 'api-stats-v0.1' && resourceType === 'statistic') {
    const policy = catalogue.operations['statistic-response-field']
    const fields = [
      'id',
      'attributes.datasetCode',
      'attributes.geography',
      'attributes.values',
      'attributes.values.{field}',
      'attributes.fieldDefinitionHashes',
      'attributes.comparability',
      'relationships.division',
      ...policy.fullOnly,
      ...Object.keys(policy.referencePeriod).map(
        key => `attributes.referencePeriod.${key}`,
      ),
    ]
    if (!fields.includes(apiField))
      return unknown(`No reviewed Statistics projection for ${apiField}.`)
    profile()
    const rule = operation(
      'statistic-response-field',
      {
        ...policy,
        apiField,
        ...(apiField === 'attributes.comparability'
          ? {
              expression:
                'For each record.values key, read the retained definition at datasetCode + "\\0" + fieldName + "\\0" + fieldDefinitionHashes[fieldName]; include its comparability only when truthy.',
              emission: 'Object.keys(comparability).length > 0',
            }
          : {}),
        ...(apiField === 'relationships.division'
          ? {
              expression:
                'record.divisionId ? {data:{type:"divisions",id:record.divisionId}} : {data:null}',
            }
          : {}),
      },
      inputs,
    )
    return {
      operation: rule,
      when:
        apiField === 'attributes.comparability' && rule.kind === 'resolver'
          ? {
              kind: 'predicate',
              definition: { ...rule.definition, branchId: 'emission' },
              arguments: { value: 'value' },
            }
          : policy.fullOnly.includes(apiField)
            ? { kind: 'compare', input: 'profile', operator: 'eq', value: 'full' }
            : { kind: 'always' },
      onAbsent: apiField === 'relationships.division' ? 'null' : 'omit',
    }
  }
  if (args.apiVersion === 'api-stats-v0.1' && resourceType === 'statistic-field') {
    inputs.definition = {
      stage: 'registry',
      scope: 'registry',
      collection: 'retainedStatisticFields',
      path: 'selectedFieldDefinition',
      role: 'value',
    }
    return {
      operation: operation(
        'statistic-field-response',
        {
          apiField,
          expression:
            'Project the selected retained field definition and its localisations, addressed by datasetCode, fieldName and versionHash.',
          implementation: {
            path: 'apps/atlas-api/src/services/statistics.ts',
            symbol: 'createIncludedStatisticFieldResource',
          },
        },
        inputs,
      ),
      when: { kind: 'always' },
      onAbsent: 'error',
    }
  }
  if (resourceType === 'place' && args.apiVersion === 'api-places-v0.1') {
    profile()
    const name = apiField.replace(/^attributes\./, '')
    const locale = /^i18n\.[^.]+\.(.+)$/.exec(name)?.[1]
    if (
      ![
        'id',
        'referenceName',
        'basicCategory',
        'operatingStatus',
        'taxonomy.primary',
        'taxonomy.hierarchy',
        'taxonomy.alternates',
        'geometry',
        'bbox',
        'sources',
        'snapshotId',
        'resourceReleaseId',
        'addressSnapshotId',
        'address2dId',
        'address3dId',
        'address3dUnitId',
        'address3dMembership',
        ...placeDivisionFieldNames,
        'identifiers',
        'identifiers.wikidata.brandId.id',
        'websites',
        'socials',
        'emails',
        'phones',
        'confidence',
        'firstSeenMonth',
        'lastSeenMonth',
        'createdAt',
        'updatedAt',
        'i18n',
        'relationships.address',
        'relationships.divisions',
      ].includes(name) &&
      !(
        locale &&
        [
          'name',
          'brandName',
          'freeformAddress',
          'accessHint',
          'nameVariant',
          'nameAlts',
          'brandNameVariant',
          'brandNameAlts',
          'meta',
        ].includes(locale)
      )
    )
      return unknown(`No reviewed Place projection for ${apiField}.`)
    const full = [
      ...placeDivisionFieldNames,
      'snapshotId',
      'resourceReleaseId',
      'addressSnapshotId',
      'address2dId',
      'address3dId',
      'address3dUnitId',
      'address3dMembership',
      'sources',
    ]
    const normal = [
      'identifiers',
      'identifiers.wikidata.brandId.id',
      'websites',
      'socials',
      'emails',
      'phones',
      'confidence',
      'firstSeenMonth',
      'lastSeenMonth',
      'createdAt',
      'updatedAt',
      'taxonomy.hierarchy',
      'taxonomy.alternates',
    ]
    let profiles = ['compact', 'default', 'map', 'full']
    if (
      full.includes(name) ||
      (locale &&
        [
          'nameVariant',
          'nameAlts',
          'brandNameVariant',
          'brandNameAlts',
          'meta',
        ].includes(locale))
    )
      profiles = ['full']
    else if (
      normal.includes(name) ||
      (locale && ['freeformAddress', 'accessHint'].includes(locale))
    )
      profiles = ['default', 'map', 'full']
    else if (['geometry', 'bbox'].includes(name)) profiles = ['map', 'full']
    const expressions: Record<string, string> = {
      geometry: '{ type: "Point", coordinates: [place.lng, place.lat] }',
      referenceName:
        'derivePlaceReferenceName(Object.entries(record.i18n).map(([locale,value]) => ({locale,name:value.name})))',
      'taxonomy.primary': 'place.taxonomyPrimary',
      'taxonomy.alternates': 'place.taxonomyAlternates',
      'relationships.address':
        'place.address2dId ? {data:{type:"addresses",id:place.address2dId}} : {data:null}',
      'relationships.divisions':
        '{data: record.divisionIds.map(id => ({type:"divisions",id}))}',
    }
    return {
      operation: operation(
        'place-response-field',
        {
          apiField,
          expression:
            expressions[name] ??
            (locale
              ? `Select locale.${locale} from the locale rows selected by the request; accessHint defaults to null.`
              : `place.${name}`),
          implementation: {
            path: 'apps/atlas-api/src/services/places.ts',
            symbol: 'createPlaceResource',
          },
          localisations:
            'Omit the i18n object if no locale rows were selected; preserve null field values.',
        },
        inputs,
      ),
      when: localisationCondition(
        { kind: 'compare', input: 'profile', operator: 'in', value: profiles },
        apiField,
      ),
      onAbsent: 'omit',
    }
  }
  if (resourceType === 'address' && args.apiVersion === 'api-addresses-v0.1') {
    profile()
    const name = apiField.replace(/^attributes\./, '')
    const locale = /^i18n\.[^.]+\.(.+)$/.exec(name)?.[1]
    if (
      ![
        'id',
        'datasetCode',
        'parentAddressId',
        'granularity',
        'address3dCoverage',
        'createdAt',
        'updatedAt',
        'geometry',
        'snapshotId',
        'identifiers',
        'identifiers.hkgov-dpo.csuId',
        'sources',
        'i18n',
        'relationships.divisions',
        'relationships.hierarchy',
        'relationships.units',
      ].includes(name) &&
      !(
        locale &&
        [
          'formattedAddress',
          'buildingName',
          'estateName',
          'streetName',
          'buildingNumberExpression',
          'buildingNumberFrom',
          'buildingNumberTo',
          'buildingNumberConnector',
          'blockExpression',
          'blockType',
          'blockRef',
          'blockTypeBeforeNumber',
          'phaseExpression',
          'phaseName',
          'phaseRef',
        ].includes(locale)
      )
    )
      return unknown(`No reviewed Address projection for ${apiField}.`)
    const profiles =
      name === 'geometry'
        ? ['map', 'full']
        : ['snapshotId', 'sources'].includes(name) || name.startsWith('identifiers')
          ? ['full']
          : ['createdAt', 'updatedAt'].includes(name) ||
              (locale && locale !== 'formattedAddress')
            ? ['default', 'map', 'full']
            : ['compact', 'default', 'map', 'full']
    const expressions: Record<string, string> = {
      geometry:
        'addressPointGeometry(address.geometry): require a finite Point with 2 or 3 coordinates, else null.',
      sources:
        'expandAddressSourceReferences(address.sources, {snapshotId, datasetCode, sourceReleaseId})',
      datasetCode:
        'activeSnapshot.datasetBySnapshot.get(address.snapshotId); missing binding errors.',
      'relationships.divisions':
        '{data:address.divisionRelationships.map(({divisionId,role})=>({type:"divisions",id:divisionId,meta:{role}}))}',
      i18n: 'Selected locale rows; compact keeps formattedAddress only; omit i18n when no locales are selected.',
    }
    return {
      operation: operation(
        'address-response-field',
        {
          apiField,
          expression:
            expressions[name] ??
            (locale ? `Select locale.${locale} from record.i18n.` : `address.${name}`),
          implementation: {
            path: 'apps/atlas-api/src/services/addresses.ts',
            symbol: 'createAddressResource',
          },
        },
        inputs,
      ),
      when: localisationCondition(
        { kind: 'compare', input: 'profile', operator: 'in', value: profiles },
        apiField,
      ),
      onAbsent: 'omit',
    }
  }
  return unknown(
    `Field-specific response projection and emission policy required for ${resourceType}.${apiField}.`,
  )
}
