import { compileCuratedRecordField } from './fieldLineageCuratedField'
import { nativeDivisionProducer } from './fieldLineageNativeDivisions'
import { statisticProfileSpecification } from './fieldLineageStatisticProfile'
import { governmentPreparedSpecification } from './fieldLineageGovernmentPreparation'
import { statisticDefinitionFoldSpecification } from './fieldLineageStatisticDefinitions'
import { statisticRecordSpecification } from './fieldLineageStatisticRecords'
import { statisticContextSpecification } from './fieldLineageStatisticContext'
import { statisticIntakeSpecification } from './fieldLineageStatisticIntake'
import { governmentAreaSpecification } from './fieldLineageGovernmentAreas'
import geometryExclusions from '../../../fixtures/meta/processing-rules/assembly/division-geometry-exclusions.json'
import { planningPreparedSpecification } from './fieldLineagePlanningPreparation'
import type { LineageDefinition, Node } from './fieldLineageTypes'
import { placePreparedSpecification } from './fieldLineagePlacePreparation'
import { compileDivisionClassificationDependency } from './fieldLineageDivisionDependencies'
import { companionProducer } from './fieldLineageCompanionProducers'
import { placeResolutionProducer } from './fieldLineagePlaceResolution'
import { alsPreparedProducer } from './fieldLineageAlsPreparation'
import type { ProducerSpecification } from './fieldLineageProducer'
import { hierarchyProducer } from './fieldLineageHierarchyPreparation'

const registryInputs = new Set([
  'sourceVersion',
  'sourceReleaseId',
  'sourceReleaseCode',
  'snapshotId',
  'resourceReleaseId',
  'datasetCode',
  'fieldMetadata',
  'measureMetadata',
  'retainedFieldDefinitions',
  'publication.cohortKey',
  'materialisationTime',
  'variant',
  'preparationTransform',
  'validateGeometry',
])
const overtureInputs = new Set([
  'id',
  'geometry',
  'names',
  'brand.names',
  'addresses',
  'sources',
  'identifiers',
  'wikidata',
  'class',
  'subtype',
  'admin_level',
  'parent_division_id',
  'hierarchies',
  'basic_category',
  'basicCategory',
  'taxonomy.primary',
  'categories.primary',
  'categories.alternate',
  'taxonomy.alternates',
  'taxonomy.alternate',
  'division_id',
  'division_ids',
])
const sources: Record<string, string> = {
  'ds-hk-overture-division': 'overture',
  'ds-hk-overture-place': 'overture',
  'ds-hk-saanseoi-division': 'saanseoi',
  'ds-hk-hkgov-pland-division-pu': 'hkgov-pland-pu',
  'ds-hk-hkgov-pland-division-new-town': 'hkgov-pland-new-town',
  'ds-hk-hkgov-had-division-area-district': 'hkgov-had',
}

export type PreparedInputContext = {
  datasetCode: string
  resourceType: string
  scope: { id: string; raw: string; prepared: string }
  key: (value: unknown) => string
  addNode: (node: Node) => { node: string; role: 'value' }
  operation: (
    code: string,
    specification: Record<string, unknown>,
    inputs: Node['inputs'],
  ) => Node['operation']
  curatedRecord: () => { node: string; role: 'value' }
  retain: (document: unknown) => string
  addGroup: (group: LineageDefinition['resolutionGroups'][number]) => void
  dependencyScope: (role: string) => string
  forDataset: (datasetCode: string, resourceType: string) => PreparedInputContext
  cache: Map<string, Node['inputs'][string]>
}

/** Each prepared value either has its actual producer or remains an explicit boundary. */
export function compilePreparedFieldInput(
  path: string,
  context: PreparedInputContext,
): Node['inputs'][string] {
  const cacheKey = JSON.stringify([context.scope.id, context.resourceType, path])
  const cached = context.cache.get(cacheKey)
  if (cached) return { ...cached }
  const result = compileInput(path, context)
  context.cache.set(cacheKey, result)
  return { ...result }
}

function compileInput(
  path: string,
  context: PreparedInputContext,
): Node['inputs'][string] {
  const { datasetCode, scope, addNode, key, operation } = context
  if (context.resourceType === 'place' && datasetCode !== 'ds-hk-overture-place')
    return compilePreparedFieldInput(
      path,
      context.forDataset('ds-hk-overture-place', 'place'),
    )
  if (
    context.resourceType === 'address' &&
    datasetCode === 'ds-hk-overture-place' &&
    path !== 'resolutions'
  ) {
    if (['officialAddresses', 'divisionMaps', 'dependencySelection'].includes(path))
      return compilePreparedFieldInput(path, context.forDataset(datasetCode, 'place'))
  }
  if (
    datasetCode === 'ds-hk-overture-division' &&
    context.resourceType === 'division' &&
    (path === 'effectiveClass' || path === 'effectiveLevel')
  )
    return compileDivisionClassificationDependency({
      path,
      sourceScope: scope.id,
      preparedScope: scope.prepared,
      input: path => compilePreparedFieldInput(path, context),
      addNode,
      operation,
      retain: context.retain,
      addGroup: context.addGroup,
    })
  if (registryInputs.has(path))
    return {
      stage: 'registry',
      scope: scope.id,
      collection: 'processingContext',
      path,
      role: path === 'sourceVersion' ? 'condition' : 'value',
    }
  const node = (inputs: Node['inputs'], transform: Node['operation']) =>
    addNode({
      id: `${scope.id}-${key([context.resourceType, path])}-prepared-row`,
      stage: 'preparation',
      output: {
        scope: scope.prepared,
        collection: `${context.resourceType}Rows`,
        path,
      },
      layer: 'baseline',
      priority: 0,
      audit: { category: 'rules', scope: 'bulk', retention: 'counts' },
      inputs,
      when: { kind: 'always' },
      operation: transform,
      onAbsent: ['packedRecord', 'place'].includes(path)
        ? 'omit'
        : path === 'intakeRows'
          ? 'error'
          : 'null',
      onFailure: 'error',
    })
  const producer: ProducerSpecification | null =
    nativeDivisionProducer(datasetCode, context.resourceType, path) ??
    (context.resourceType === 'place'
      ? (companionProducer(path, 'place') ?? placeResolutionProducer(path))
      : context.resourceType === 'address' && datasetCode === 'ds-hk-hkgov-dpo-address'
        ? (companionProducer(path, 'address') ?? alsPreparedProducer(path))
        : context.resourceType === 'address' && datasetCode === 'ds-hk-overture-place'
          ? placeResolutionProducer(path)
          : context.resourceType === 'division' &&
              datasetCode === 'ds-hk-overture-division'
            ? hierarchyProducer(path)
            : null)
  if (producer) {
    const inputs: Node['inputs'] = Object.fromEntries(
      producer.inputs.map(input => [
        input,
        compilePreparedFieldInput(
          input,
          context.resourceType === 'address' && datasetCode === 'ds-hk-overture-place'
            ? context.forDataset(datasetCode, 'place')
            : context,
        ),
      ]),
    )
    for (const [name, read] of Object.entries(producer.reads ?? {}))
      inputs[name] = {
        stage: read.stage,
        scope: read.dependency
          ? context.dependencyScope(read.dependency)
          : read.stage === 'raw'
            ? scope.raw
            : read.stage === 'request'
              ? 'request'
              : scope.id,
        collection: read.collection,
        path: read.path,
        role: read.role ?? 'value',
      }
    const id = `${scope.id}-${key([context.resourceType, path])}-producer`
    const output = {
      scope: scope.prepared,
      collection: `${context.resourceType}Rows`,
      path,
    }
    const layer = producer.layer ?? 'baseline'
    const specification = {
      ...producer,
      ...(producer.document && typeof producer.document === 'object'
        ? { document: context.retain(producer.document) }
        : {}),
    }
    const transform = operation(
      `${context.resourceType}-${path}`,
      specification,
      inputs,
    )
    const audit: Node['audit'] =
      (producer.audit ? structuredClone(producer.audit) : undefined) ??
      (layer === 'curation' || layer === 'patch'
        ? {
            category: layer === 'patch' ? 'patches' : 'curations',
            scope: 'individual',
            retention: 'decision',
            binding: {
              owner: scope.id,
              recordKeyInputs: Object.keys(inputs).filter(
                name => name !== 'sourceVersion',
              ),
              fixturePointer: '/retainedInstructions',
              outputSelector: path,
              evidenceContract: 'processing-audit',
            },
          }
        : { category: 'rules', scope: 'bulk', retention: 'counts' })
    if (audit.retention === 'decision' && !audit.binding)
      audit.binding = {
        owner: scope.id,
        recordKeyInputs: Object.keys(inputs).filter(name => name !== 'sourceVersion'),
        fixturePointer: '/retainedInstructions',
        outputSelector: path,
        evidenceContract: 'processing-audit',
      }
    if (producer.resolutionCandidates) {
      const analysis = inputs.resolutionAnalysis!
      const classification = addNode({
        id: `${id}-audit-layer`,
        stage: 'preparation',
        output: { ...output, path: 'resolutionAuditLayer' },
        layer: 'baseline',
        priority: 0,
        audit: { category: 'rules', scope: 'bulk', retention: 'definition-only' },
        inputs: { result: analysis },
        when: { kind: 'always' },
        operation: operation(
          'place-resolution-audit-layer',
          {
            implementation: producer.implementation,
            expression:
              'Explicit or recorded decision/retirement, or entry.acceptanceMode === "curated", yields curation; every other branch yields conditional-rule. Review remains a blocking outcome.',
          },
          { result: analysis },
        ),
        onAbsent: 'error',
        onFailure: 'error',
      })
      const candidates: string[] = []
      for (const candidate of ['conditional-rule', 'curation'] as const) {
        const candidateId = `${id}-${candidate}`
        addNode({
          id: candidateId,
          stage: 'preparation',
          output,
          layer: candidate,
          priority: 0,
          inputs: { ...inputs, auditLayer: classification },
          when: {
            kind: 'compare',
            input: 'auditLayer',
            operator: 'eq',
            value: candidate,
          },
          operation: transform,
          audit:
            candidate === 'conditional-rule'
              ? { category: 'rules', scope: 'bulk', retention: 'counts' }
              : {
                  category: 'curations',
                  scope: 'individual',
                  retention: 'decision',
                  binding: {
                    owner: scope.id,
                    recordKeyInputs: ['resolutionAnalysis'],
                    fixturePointer: '/retainedInstructions/overture-place-address',
                    outputSelector: 'resolution',
                    evidenceContract: 'processing-audit',
                  },
                },
          onAbsent: 'error',
          onFailure: 'error',
        })
        candidates.push(candidateId)
      }
      context.addGroup({
        id,
        output,
        candidates,
        evaluation: 'per-record',
        keyInputs: [],
      })
      return { group: id, role: 'value' }
    }
    return addNode({
      id,
      stage: 'preparation',
      output,
      inputs,
      layer,
      priority: 0,
      audit,
      when: { kind: 'always' },
      operation: transform,
      onAbsent: path === 'alsSelectedRow' ? 'omit' : 'error',
      onFailure: 'error',
    })
  }
  const place =
    datasetCode === 'ds-hk-overture-place' &&
    context.resourceType === 'place' &&
    placePreparedSpecification(path)
  if (place) {
    const inputs: Node['inputs'] = Object.fromEntries(
      place.inputs.map(input => [input, compilePreparedFieldInput(input, context)]),
    )
    if (path === 'selectedAddress') inputs.resolution!.role = 'selection'
    if (path === 'previousIdentity') inputs.id!.role = 'join-key'
    if (path === 'divisionMembership') inputs.effectiveCoordinates!.role = 'selection'
    if (path === 'place') inputs.sourceVersion!.role = 'condition'
    if ('rawRecord' in place && place.rawRecord)
      inputs.publisherRecord = {
        stage: 'raw',
        scope: scope.raw,
        collection: 'publisher',
        path: '$',
        role: 'value',
      }
    return node(inputs, operation(`place-${path}`, place, inputs))
  }
  const planning = planningPreparedSpecification(
    datasetCode,
    context.resourceType,
    path,
  )
  if (planning) {
    const inputs: Node['inputs'] = Object.fromEntries(
      planning.inputs.map(input => [input, compilePreparedFieldInput(input, context)]),
    )
    if (planning.rawArchive)
      inputs.archive = {
        stage: 'raw',
        scope: scope.raw,
        collection: 'archive',
        path: '$',
        role: 'value',
      }
    return node(
      inputs,
      operation(`planning-${path}`, { datasetCode, ...planning }, inputs),
    )
  }
  const government = governmentPreparedSpecification(
    datasetCode,
    context.resourceType,
    path,
  )
  if (government) {
    const inputs: Node['inputs'] = Object.fromEntries(
      government.publisherPaths.map(publisherPath => [
        publisherPath,
        {
          stage: 'raw',
          scope: scope.raw,
          collection: 'publisherFeatures',
          path: publisherPath,
          role: 'value',
        },
      ]),
    )
    inputs.sourceVersion = compilePreparedFieldInput('sourceVersion', context)
    inputs.publisherSet = {
      stage: 'raw',
      scope: scope.raw,
      collection: 'publisherFeatures',
      path: '$',
      role: 'guard',
    }
    return node(
      inputs,
      operation(
        'government-prepared-field',
        { outputPath: path, ...government },
        inputs,
      ),
    )
  }
  const area =
    context.resourceType === 'divisionArea' &&
    governmentAreaSpecification(datasetCode, path)
  if (area) {
    const inputs: Node['inputs'] = Object.fromEntries(
      area.inputs.map(input => [input, compilePreparedFieldInput(input, context)]),
    )
    if (path === 'governmentAreaRows')
      for (const input of Object.values(inputs)) input.role = 'selection'
    if (area.rawArchive)
      inputs.archive = {
        stage: 'raw',
        scope: scope.raw,
        collection: 'archive',
        path: '$',
        role: 'value',
      }
    return node(
      inputs,
      operation(`government-area-${path}`, { datasetCode, ...area }, inputs),
    )
  }
  if (
    context.resourceType === 'divisionArea' &&
    path === 'normalisedAreaCoverage' &&
    (governmentAreaSpecification(datasetCode, 'governmentAreaRows') ||
      datasetCode === 'ds-hk-hkgov-pland-division-pu')
  ) {
    const inputs: Node['inputs'] = Object.fromEntries(
      ['governmentAreaRows', 'source', 'variant', 'validateGeometry'].map(input => [
        input,
        compilePreparedFieldInput(input, context),
      ]),
    )
    for (const [name, input] of Object.entries(inputs))
      if (name !== 'governmentAreaRows') input.role = 'selection'
    return node(
      inputs,
      operation(
        'normalised-government-area-coverage',
        {
          implementation: {
            path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
            symbol: 'normaliseDivisionAreaGeometry',
          },
          exclusionPolicy: geometryExclusions,
          expression:
            'Map the complete prepared area set through normaliseDivisionAreaGeometryRow in input order, retaining non-null results and their canonical IDs. This is the coverage supplied to the upload display simplifier.',
          steps: [
            'Apply the retained region/Division exclusion policy; require non-empty id/division_id and Polygon/MultiPolygon geometry; apply requested validity checks.',
            'Normalise canonical IDs, provider identifiers/source references and government land/territorial flags. Recompute bbox from normalised geometry and remove an embedded bbox.',
            'Keep the geometry-to-canonical-ID association and original row order. Simplification consumes all accepted geometries together, not independently per feature.',
          ],
        },
        inputs,
      ),
    )
  }
  const profile = statisticProfileSpecification(datasetCode)
  const intake = profile && statisticIntakeSpecification(datasetCode, path)
  if (intake) {
    const inputs: Node['inputs'] = Object.fromEntries(
      intake.inputs.map(input => [input, compilePreparedFieldInput(input, context)]),
    )
    if (intake.rawArchive)
      inputs.archive = {
        stage: 'raw',
        scope: scope.raw,
        collection: 'archive',
        path: '$',
        role: 'value',
      }
    return node(
      inputs,
      operation(`statistic-${path}`, { datasetCode, ...intake }, inputs),
    )
  }
  const statisticContext = profile && statisticContextSpecification(datasetCode, path)
  if (statisticContext) {
    const inputs: Node['inputs'] = Object.fromEntries(
      statisticContext.inputs.map(input => [
        input,
        compilePreparedFieldInput(input, context),
      ]),
    )
    return node(
      inputs,
      operation(`statistic-${path}`, { datasetCode, ...statisticContext }, inputs),
    )
  }
  const record = profile && statisticRecordSpecification(path)
  if (record) {
    const inputs: Node['inputs'] = Object.fromEntries(
      record.inputs.map(input => [input, compilePreparedFieldInput(input, context)]),
    )
    if (path === 'packedRecord')
      inputs.selectedRecordId = {
        stage: 'request',
        scope: 'request',
        collection: 'selectedRecord',
        path: 'id',
        role: 'selection',
      }
    return node(
      inputs,
      operation(`statistic-${path}`, { datasetCode, ...record, profile }, inputs),
    )
  }
  if (
    profile &&
    ['fields', 'field', 'fieldsI18n', 'measures', 'measuresI18n'].includes(path)
  ) {
    const inputs: Node['inputs'] = {
      publisherFeatures: compilePreparedFieldInput('intakeRows', context),
      datasetCode: compilePreparedFieldInput('datasetCode', context),
      sourceVersion: compilePreparedFieldInput('sourceVersion', context),
      fieldMetadata: compilePreparedFieldInput('fieldMetadata', context),
      measureMetadata: compilePreparedFieldInput('measureMetadata', context),
    }
    if (path === 'field')
      inputs.selectedField = {
        stage: 'registry',
        scope: 'registry',
        collection: 'lineageContext',
        path: 'record.fieldName',
        role: 'selection',
      }
    return node(
      inputs,
      operation(
        'statistic-definition-fold',
        {
          ...statisticDefinitionFoldSpecification(),
          profile,
          output:
            path === 'field'
              ? 'Select the fields entry matching datasetCode and selectedField; require exactly one.'
              : path,
        },
        inputs,
      ),
    )
  }
  if (profile && path === 'referencePeriodCode') {
    const inputs: Node['inputs'] = {
      properties: compilePreparedFieldInput('properties', context),
      sourceVersion: compilePreparedFieldInput('sourceVersion', context),
    }
    return node(
      inputs,
      operation(
        'statistic-reference-period-code',
        {
          ...profile,
          expression: profile.periodExpression,
          guards: [
            'Require non-empty period properties and reject invalid periods with parseStatisticsReferencePeriod.',
          ],
        },
        inputs,
      ),
    )
  }
  if (profile && path === 'sourceField') {
    const inputs: Node['inputs'] = {
      properties: compilePreparedFieldInput('properties', context),
    }
    return node(
      inputs,
      operation(
        'statistic-publisher-field-selection',
        {
          ...profile,
          expression:
            'Iterate Object.entries(properties) in publisher property order; skip profile identifierFields and values whose literal conversion is null. For identifierConditions, include each listed identifier group only when properties[conditionKey] !== undefined. Bind sourceField to the remaining key and retain sourceValue = literal(value). Empty strings are null after trimming.',
          implementation: {
            path: 'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts',
            symbol: 'normaliseStatistics',
          },
          additionalImplementations: [profile.implementation],
          selection: {
            cardinality: 'one-to-many',
            key: 'sourceField',
            order: 'Object.entries(properties)',
          },
        },
        inputs,
      ),
    )
  }
  const source =
    sources[datasetCode] ??
    (datasetCode.startsWith('ds-hk-hkgov-censtatd-') ? 'hkgov-censtatd' : undefined)
  if (path === 'source' && source) return node({}, { kind: 'constant', value: source })
  if (
    datasetCode === 'ds-hk-saanseoi-division' &&
    context.resourceType === 'division' &&
    path.startsWith('record.')
  )
    return compileCuratedRecordField(path, context)
  if (datasetCode === 'ds-hk-saanseoi-division' && path === 'record')
    return context.curatedRecord()
  if (datasetCode.startsWith('ds-hk-overture-') && overtureInputs.has(path))
    return node(
      {
        value: {
          stage: 'raw',
          scope: scope.raw,
          collection: 'publisher',
          path,
          role: 'value',
        },
      },
      { kind: 'copy', input: 'value' },
    )
  if (
    datasetCode === 'ds-hk-saanseoi-division' &&
    context.resourceType === 'divisionArea'
  ) {
    const renamed: Record<string, string> = {
      division_id: 'divisionId',
      class: 'type',
      is_land: 'isLand',
      is_territorial: 'isTerritorial',
    }
    const parsed = new Set([
      'geometry',
      'bbox',
      'hierarchies',
      'identifiers',
      'sources',
      'cartography',
    ])
    if (['id', ...Object.keys(renamed), ...parsed].includes(path)) {
      const publisherPath = renamed[path] ?? path
      const inputs: Node['inputs'] = {
        value: {
          stage: 'raw',
          scope: scope.raw,
          collection: 'archiveRows',
          path: publisherPath,
          role: 'value',
        },
        archive: {
          stage: 'raw',
          scope: scope.raw,
          collection: 'archive',
          path: '$',
          role: 'guard',
        },
      }
      return node(
        inputs,
        operation(
          'curated-area-prepared-field',
          {
            outputPath: path,
            inputPath: publisherPath,
            expression: parsed.has(path)
              ? 'typeof value === "string" ? JSON.parse(value) : value'
              : ['is_land', 'is_territorial'].includes(path)
                ? 'value == null ? null : Boolean(value)'
                : 'value',
            implementation: {
              path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/archiveInput.ts',
              symbol: 'curatedArchiveRows',
            },
            additionalImplementations: [
              {
                path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/administrativeAreas.ts',
                symbol: 'buildAdministrativeAreas',
              },
              {
                path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/assemble.ts',
                symbol: 'assembleCuratedDivisions',
              },
              {
                path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/islandGroupGeometry.ts',
                symbol: 'deriveIslandGroupGeometry',
              },
            ],
            guards: [
              'Validate the archive manifest and retained source release identities.',
              'Require unique non-empty IDs, divisionId and Polygon/MultiPolygon geometry before writing prepared rows.',
            ],
          },
          inputs,
        ),
      )
    }
  }
  return {
    stage: 'prepared',
    scope: scope.prepared,
    collection: 'rows',
    path,
    role: 'value',
  }
}
