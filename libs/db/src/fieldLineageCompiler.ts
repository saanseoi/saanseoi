import type { ApiFieldInput, ApiFieldRulePin, PublisherFields } from './apiFieldInputs'
import { resolvePublisherFieldPaths } from './apiFieldInputs'
import type {
  Condition,
  FieldRef,
  LineageDefinition,
  Node,
  ReleaseBinding,
} from './fieldLineageTypes'
import {
  FIELD_LINEAGE_RESOLUTION,
  fieldLineageClosure,
  validateFieldLineageDefinition,
  validateFieldLineageBinding,
} from './fieldLineageGraph'
import { computeVersionHash } from './versioning'
import { compileResponseField } from './fieldLineageComposition'
import {
  compilePreparedFieldInput,
  type PreparedInputContext,
} from './fieldLineagePreparedInputs'
import { producerDependencyScope } from './fieldLineageProducer'
import { currentFieldRule } from './fieldLineageCurrentRules'
import { geometryDisplayTransform } from './fieldLineageGeometryTransform'
import { divisionOverrideNodes } from './fieldLineageDivisionOverrides'
import { sourceRetentionSpecification } from './fieldLineageSourceRules'
import operationCatalogue from '../../../fixtures/meta/fieldLineage/operations.json'
import implementationEvidence from '../../../fixtures/meta/fieldLineage/implementation-evidence.json'

/** Authoring input only. Dependencies are grouped; their old ranking is not rule precedence. */
export type FieldLineageMapping = {
  resourceType: string
  apiField: string
  variant: string | null
  sourceDatasetId: string
  inputs: ApiFieldInput[]
  canonicalInputs: string[]
  resolverCode: string
  contributionType: string
  priority: number
  confidence: number | null
  resolverRules: ApiFieldRulePin[]
}
export type LineageSource = {
  sourceDatasetId: string
  sourceSchemaVersion: string
  datasetCode?: string
  resourceType?: string
  resourceReleaseId: string
  sourceReleaseId?: string | null
  processingRules: unknown
  processingManifest?: { hash: string; byteLength: number }
  producerSnapshotIds?: string[]
}
export type LineagePublicationContext = {
  api: LineageDefinition['api']
  apiReleaseSetId: string
  apiVersionReleaseSetId: string
  sources: LineageSource[]
  snapshots: Array<{
    snapshotId: string
    resourceType: string
    snapshotRecipeId?: string
    processingRules?: unknown
  }>
  responseDefinition: unknown
}

const audit = { category: 'rules', scope: 'bulk', retention: 'counts' } as const
const always: Condition = { kind: 'always' }
const key = (value: unknown) => computeVersionHash(value).slice(7, 31)

/** Retain current processor contracts and scope them to the captured publication inputs. */
export function compileFieldLineage(
  rows: FieldLineageMapping[],
  publisherFields: ReadonlyMap<string, PublisherFields[string]>,
  context: LineagePublicationContext,
) {
  const definition: LineageDefinition = {
    kind: 'api-response-lineage-definition',
    schemaVersion: 2,
    api: context.api,
    definitions: {},
    sourceSchemas: [],
    scopes: [
      { id: 'response', kind: 'response', bindingRole: 'apiResponse' },
      { id: 'request', kind: 'request', bindingRole: 'request' },
      { id: 'registry', kind: 'registry', bindingRole: 'selectedRelease' },
    ],
    resolution: structuredClone(
      FIELD_LINEAGE_RESOLUTION,
    ) as LineageDefinition['resolution'],
    nodes: [],
    resolutionGroups: [],
    fields: [],
  }
  const binding: ReleaseBinding = {
    apiReleaseSetId: context.apiReleaseSetId,
    apiVersionReleaseSetId: context.apiVersionReleaseSetId,
    definitionId: '',
    scopes: [{ scopeId: 'registry' }],
  }
  const retain = (document: unknown) => {
    const hash = computeVersionHash(document)
    definition.definitions[hash] = document
    return hash
  }
  if (retain(context.responseDefinition) !== context.api.responseSchemaHash)
    throw new Error(
      'Response definition does not match the selected response schema hash.',
    )
  const retainProcessing = (document: unknown) => {
    if (!document) return
    retain(document)
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (
        !Array.isArray(value) &&
        (value as { kind?: string }).kind === 'processing-rule'
      )
        retain(value)
      for (const child of Object.values(value)) visit(child)
    }
    visit(document)
  }
  const operation = (
    code: string,
    specification: Record<string, unknown>,
    inputs: Node['inputs'],
  ): Node['operation'] => {
    const implementation = specification.implementation as
      | { path: string; symbol: string }
      | undefined
    const evidence = implementationEvidence.implementations as Record<string, unknown>
    const captured =
      (implementation && evidence[`${implementation.path}#${implementation.symbol}`]) ??
      evidence[code]
    const document = {
      kind: 'field-lineage-operation',
      schemaVersion: 1,
      id: code,
      ...specification,
      ...(captured
        ? {
            implementationEvidence: captured,
            verification: 'current-code-correspondence',
          }
        : {}),
    }
    return {
      kind: 'resolver',
      definition: {
        store: 'lineageRuleDefinitions',
        definitionId: retain(document),
        operationCode: code,
        ruleId: code,
      },
      arguments: Object.fromEntries(Object.keys(inputs).map(name => [name, name])),
      parameters: {},
    }
  }
  const addNode = (node: Node) => {
    const existing = definition.nodes.find(candidate => candidate.id === node.id)
    if (existing && computeVersionHash(existing) !== computeVersionHash(node))
      throw new Error(`Conflicting lineage node ${node.id}`)
    if (!existing) definition.nodes.push(node)
    return { node: node.id, role: 'value' as const }
  }
  const sourceScopes = new Map<
    string,
    { id: string; prepared: string; raw: string; source: LineageSource }[]
  >()
  const curatedRecord = (scope: { id: string; prepared: string; raw: string }) => {
    const inputs: Node['inputs'] = {
      record: {
        stage: 'raw',
        scope: scope.raw,
        collection: 'archiveRows',
        path: '$',
        role: 'value',
      },
    }
    return addNode({
      id: `${scope.id}-curated-record`,
      stage: 'preparation',
      output: { scope: scope.prepared, collection: 'rows', path: 'record' },
      layer: 'baseline',
      priority: 0,
      audit,
      inputs,
      when: always,
      operation: operation(
        'serialise-curated-record',
        {
          expression: 'JSON.stringify(record)',
          implementation: {
            path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/archiveInput.ts',
            symbol: 'curatedArchiveRows',
          },
          guards: [
            'Validate manifest identities, archive membership and unique record IDs.',
            'Require locale-keyed names and full ancestry; reject missing, self-referencing or conflicting ancestors.',
          ],
        },
        inputs,
      ),
      onAbsent: 'error',
      onFailure: 'error',
    })
  }
  for (const source of [...context.sources].sort((a, b) =>
    a.resourceReleaseId.localeCompare(b.resourceReleaseId),
  )) {
    if (!source.sourceSchemaVersion)
      throw new Error(
        `Source schema version missing for dataset ${source.sourceDatasetId}.`,
      )
    retainProcessing(source.processingRules)
    const identity = {
      dataset: source.sourceDatasetId,
      resourceType: source.resourceType ?? null,
      schema: source.sourceSchemaVersion,
      policy: source.processingRules
        ? computeVersionHash(source.processingRules)
        : null,
    }
    const base = `input-${key(identity)}`
    // Multiple releases of the same schema/policy remain separately bound scopes.
    const ordinal =
      sourceScopes
        .get(source.sourceDatasetId)
        ?.filter(entry => entry.id.startsWith(base)).length ?? 0
    const id = `${base}-${ordinal}`,
      prepared = `${id}-prepared`,
      raw = `${id}-raw`
    definition.scopes.push(
      {
        id,
        kind: 'source-release',
        sourceDatasetId: source.sourceDatasetId,
        ...(source.resourceType ? { resourceType: source.resourceType } : {}),
        ...(source.datasetCode ? { datasetCode: source.datasetCode } : {}),
        schemaVersion: source.sourceSchemaVersion,
        bindingRole: id,
      },
      { id: prepared, kind: 'prepared-artefact', bindingRole: prepared },
      { id: raw, kind: 'raw-asset', bindingRole: raw },
    )
    definition.sourceSchemas.push({
      scopeId: id,
      sourceDatasetId: source.sourceDatasetId,
      sourceSchemaVersion: source.sourceSchemaVersion,
    })
    for (const scopeId of [id, prepared, raw])
      binding.scopes.push({
        scopeId,
        resourceReleaseId: source.resourceReleaseId,
        ...(source.sourceReleaseId ? { sourceReleaseId: source.sourceReleaseId } : {}),
        sourceSchemaVersion: source.sourceSchemaVersion,
        ...(source.processingManifest
          ? { processingManifest: source.processingManifest }
          : {}),
        definitionHashes: source.processingRules
          ? [computeVersionHash(source.processingRules)]
          : [],
      })
    const entries = sourceScopes.get(source.sourceDatasetId) ?? []
    entries.push({ id, prepared, raw, source })
    sourceScopes.set(source.sourceDatasetId, entries)
  }
  for (const snapshot of context.snapshots) retainProcessing(snapshot.processingRules)
  const preparedCache: PreparedInputContext['cache'] = new Map()
  const preparedContext = (
    scope: { id: string; raw: string; prepared: string },
    datasetCode: string,
    resourceType: string,
  ): PreparedInputContext => ({
    datasetCode,
    resourceType,
    scope,
    key,
    addNode,
    operation,
    retain,
    cache: preparedCache,
    curatedRecord: () => curatedRecord(scope),
    addGroup: group => {
      if (!definition.resolutionGroups.some(existing => existing.id === group.id))
        definition.resolutionGroups.push(group)
    },
    dependencyScope: role =>
      producerDependencyScope(
        definition,
        binding,
        scope.id,
        role,
        [...sourceScopes.values()].flat().find(value => value.id === scope.id)?.source
          .producerSnapshotIds ??
          context.snapshots
            .filter(snapshot => snapshot.resourceType === resourceType)
            .map(snapshot => snapshot.snapshotId),
      ),
    forDataset: (dataset, resource) => {
      if (dataset === datasetCode) return preparedContext(scope, dataset, resource)
      const matches = [...sourceScopes.values()]
        .flat()
        .filter(
          value =>
            value.source.datasetCode === dataset &&
            (!value.source.resourceType || value.source.resourceType === resource),
        )
      if (matches.length !== 1)
        throw new Error(
          `Expected one selected producer scope for ${dataset}/${resource}; found ${matches.length}`,
        )
      return preparedContext(matches[0]!, dataset, resource)
    },
  })
  const canonicalScope = (resourceType: string) => {
    const id = `canonical-${resourceType}`
    if (!definition.scopes.some(scope => scope.id === id)) {
      definition.scopes.push({
        id,
        kind: 'snapshot',
        resourceType,
        bindingRole: resourceType,
      })
      const snapshots = context.snapshots.filter(
        snapshot =>
          snapshot.resourceType ===
          (resourceType.startsWith('statistic') ? 'divisionStatistic' : resourceType),
      )
      // Variant-specific snapshot selection is resolved by the release composition.
      binding.scopes.push({
        scopeId: id,
        ...(snapshots.length === 1
          ? {
              snapshotId: snapshots[0]!.snapshotId,
              ...(snapshots[0]!.snapshotRecipeId
                ? { snapshotRecipeId: snapshots[0]!.snapshotRecipeId }
                : {}),
            }
          : {
              snapshotIds: snapshots.map(snapshot => snapshot.snapshotId).sort(),
              snapshotRecipeIds: snapshots
                .flatMap(snapshot =>
                  snapshot.snapshotRecipeId ? [snapshot.snapshotRecipeId] : [],
                )
                .sort(),
            }),
      })
    }
    return id
  }
  const grouped = new Map<string, FieldLineageMapping[]>()
  for (const original of rows) {
    const row =
      original.resourceType === 'statistic' &&
      original.apiField.startsWith('attributes.values.')
        ? {
            ...original,
            apiField: 'attributes.values.{field}',
            canonicalInputs: ['statistic.values.{field}'],
          }
        : original
    const id = JSON.stringify([row.resourceType, row.apiField, row.variant])
    const entries = grouped.get(id) ?? []
    entries.push(row)
    grouped.set(id, entries)
  }
  for (const [fieldKey, mappings] of [...grouped].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const first = mappings[0]!,
      canonical = canonicalScope(first.resourceType)
    const fieldId = key(fieldKey)
    const output = {
      scope: canonical,
      collection: first.resourceType,
      path:
        first.canonicalInputs[0]?.replace(`${first.resourceType}.`, '') ??
        first.apiField,
    }
    const candidates: string[] = []
    for (const dataset of [
      ...new Set(mappings.map(row => row.sourceDatasetId)),
    ].sort()) {
      const datasetRows = mappings.filter(row => row.sourceDatasetId === dataset)
      const sources = sourceScopes.get(dataset)
      if (!sources?.length)
        throw new Error(`Source schema version missing for dataset ${dataset}.`)
      for (const scope of sources) {
        const inputs: Node['inputs'] = {}
        const inputDeclarations: ApiFieldInput[] =
          first.apiField === 'attributes.values.{field}'
            ? [{ origin: 'intermediate', fieldPath: 'properties[{sourceField}]' }]
            : [
                ...new Map(
                  datasetRows
                    .flatMap(row => row.inputs)
                    .map(input => [JSON.stringify(input), input]),
                ).values(),
              ]
        const codes = [...new Set(datasetRows.map(row => row.resolverCode))].sort()
        let index = 0
        for (const input of inputDeclarations) {
          const name = `input${index++}`
          if (input.origin === 'constant') continue
          if (input.origin === 'source') {
            const sourcePath = input.fieldPath
            const rawPaths = resolvePublisherFieldPaths(
              sourcePath,
              publisherFields.get(dataset) ?? {},
            )
            const inputId = `${scope.id}-${key(sourcePath)}`
            const rawInputs: Node['inputs'] = Object.fromEntries(
              rawPaths.map((path, i) => [
                `raw${i}`,
                {
                  stage: 'raw',
                  scope: scope.raw,
                  collection: 'publisher',
                  path,
                  role: 'evidence',
                } satisfies FieldRef,
              ]),
            )
            const curated =
              scope.source.datasetCode === 'ds-hk-saanseoi-division' &&
              scope.source.resourceType === 'division'
            if (curated) rawInputs.record = curatedRecord(scope)
            const sourceSpecification = sourceRetentionSpecification(
              scope.source.datasetCode ?? '',
              sourcePath,
              scope.source.resourceType,
            )
            if (sourceSpecification)
              for (const path of sourceSpecification.inputs)
                rawInputs[path] = {
                  stage: 'raw',
                  scope: scope.raw,
                  collection: 'publisher',
                  path: '$',
                  role: 'value',
                }
            // Selection between alternative locations must remain explicit, not a fabricated copy.
            inputs[name] = addNode({
              id: `${inputId}-ingestion`,
              stage: 'ingestion',
              output: { scope: scope.id, collection: 'source', path: sourcePath },
              layer: 'baseline',
              priority: 0,
              audit,
              inputs: rawInputs,
              when: always,
              operation: curated
                ? operation(
                    'curated-source-property',
                    {
                      outputPath: sourcePath,
                      expression:
                        'Parse record JSON; retain id as sourceRecordId, geometry as sourceGeometry, and remaining entries as properties; select outputPath.',
                      implementationPath:
                        'libs/core/src/pipeline/services/sources/sourcePayload.ts',
                    },
                    rawInputs,
                  )
                : sourceSpecification
                  ? operation(
                      'publisher-source-retention',
                      sourceSpecification,
                      rawInputs,
                    )
                  : {
                      kind: 'unresolved',
                      reason:
                        'Publisher locations are known; the captured raw/prepared materialisation must supply the field transformation.',
                      definitionIds: scope.source.processingRules
                        ? [computeVersionHash(scope.source.processingRules)]
                        : [],
                    },
              onAbsent: 'omit',
              onFailure: 'error',
            })
          } else {
            // Registry context selects records. Broad authoring contexts are not value dependencies.
            inputs[name] = {
              stage:
                input.origin === 'registry'
                  ? 'registry'
                  : input.origin === 'intermediate'
                    ? 'prepared'
                    : 'audit',
              scope: input.origin === 'intermediate' ? scope.prepared : 'registry',
              collection: input.origin,
              path: input.fieldPath,
              role:
                input.origin === 'registry'
                  ? 'selection'
                  : input.origin === 'curation'
                    ? 'evidence'
                    : 'value',
            }
          }
        }
        const pins = [
          ...new Map(
            datasetRows
              .flatMap(row => row.resolverRules)
              .filter(
                pin =>
                  pin.stage !== 'ingestion' ||
                  pin.resourceReleaseId === scope.source.resourceReleaseId,
              )
              .map(pin => [pin.definitionHash, pin]),
          ).values(),
        ]
        for (const pin of pins)
          if (!definition.definitions[pin.definitionHash])
            throw new Error(
              `Missing captured field rule definition ${pin.ruleId}: ${pin.definitionHash}`,
            )
        const values = Object.entries(inputs).filter(
          ([, input]) => input.role === 'value',
        )
        const constants = inputDeclarations.filter(input => input.origin === 'constant')
        const direct =
          codes.length === 1 && codes[0] === 'direct_copy' && values.length === 1
        const constant =
          codes.length === 1 && codes[0] === 'constant_value' && constants.length === 1
        let assemblyOperation: Node['operation'] = constant
          ? { kind: 'constant', value: (constants[0] as { value: unknown }).value }
          : direct
            ? { kind: 'copy', input: values[0]![0] }
            : {
                kind: 'unresolved',
                reason: `Field-specific assembly policy required for ${first.canonicalInputs.join(', ')} (${codes.join(', ')}).`,
                definitionIds: pins.map(pin => pin.definitionHash),
              }
        const datasetCode = scope.source.datasetCode ?? ''
        const geometryType =
          ['divisionArea', 'divisionBoundary'].includes(first.resourceType) &&
          first.apiField === 'attributes.type'
        if (
          geometryType &&
          first.resourceType === 'divisionArea' &&
          [
            'ds-hk-hkgov-pland-division-pu',
            'ds-hk-hkgov-pland-division-new-town',
          ].includes(datasetCode)
        ) {
          // Provider flags are both forced true; Planning names/codes do not determine type.
          for (const name of Object.keys(inputs)) delete inputs[name]
          assemblyOperation = { kind: 'constant', value: 'mixed' }
        } else if (geometryType && !direct && !constant) {
          for (const [name, input] of Object.entries(inputs)) {
            const declared = inputDeclarations[Number(name.slice(5))]
            if (
              declared &&
              'fieldPath' in declared &&
              /\.(isLand|isTerritorial)$/.test(declared.fieldPath)
            )
              input.role = 'condition'
            if (declared && 'fieldPath' in declared) {
              const semantic =
                /\.(class|isLand|isTerritorial)$/.exec(declared.fieldPath)?.[1] ??
                (datasetCode === 'ds-hk-saanseoi-division' &&
                declared.fieldPath === 'properties.type'
                  ? 'class'
                  : undefined)
              if (semantic) {
                inputs[semantic] = input
                if (datasetCode === 'ds-hk-saanseoi-division') {
                  const preparedInputs: Node['inputs'] = Object.fromEntries(
                    resolvePublisherFieldPaths(
                      declared.fieldPath,
                      publisherFields.get(dataset) ?? {},
                    ).map((path, i) => [
                      `raw${i}`,
                      {
                        stage: 'raw',
                        scope: scope.raw,
                        collection: 'archiveRows',
                        path,
                        role: 'value',
                      },
                    ]),
                  )
                  const preparedInput = addNode({
                    id: `${scope.id}-${semantic}-area-preparation`,
                    stage: 'preparation',
                    output: {
                      scope: scope.prepared,
                      collection: 'rows',
                      path:
                        semantic === 'class'
                          ? 'class'
                          : semantic === 'isLand'
                            ? 'is_land'
                            : 'is_territorial',
                    },
                    layer: 'baseline',
                    priority: 0,
                    audit,
                    inputs: preparedInputs,
                    when: always,
                    operation: operation(
                      'curated-area-field',
                      {
                        field: semantic,
                        expression:
                          semantic === 'class'
                            ? 'row.type'
                            : 'value == null ? null : Boolean(value)',
                        implementationPath:
                          'apps/harbour-cli/src/lib/pipeline/curatedDivisions/archiveInput.ts',
                      },
                      preparedInputs,
                    ),
                    onAbsent: 'null',
                    onFailure: 'error',
                  })
                  inputs[semantic] = {
                    ...preparedInput,
                    role: semantic === 'class' ? 'value' : 'condition',
                  }
                }
                delete inputs[name]
              }
            }
          }
          assemblyOperation = operation(
            'division-geometry-type',
            operationCatalogue.operations['division-geometry-type'],
            inputs,
          )
        } else if (
          datasetCode.includes('hkgov-censtatd') &&
          first.apiField.startsWith('attributes.values.')
        ) {
          inputs.fieldDefinitions = {
            stage: 'registry',
            scope: 'registry',
            collection: 'retainedStatisticFields',
            path: 'fieldDefinitionHashes[{field}]',
            role: 'selection',
          }
          const preparedInputs: Node['inputs'] = {
            packedRecord: compilePreparedFieldInput(
              'packedRecord',
              preparedContext(scope, datasetCode, first.resourceType),
            ),
            field: {
              stage: 'registry',
              scope: 'registry',
              collection: 'lineageContext',
              path: 'selectorBindings.field',
              role: 'selection',
            },
            fieldDefinitions: inputs.fieldDefinitions,
          }
          const prepared = addNode({
            id: `${fieldId}-${scope.id}-statistic-preparation`,
            stage: 'preparation',
            output: {
              scope: scope.prepared,
              collection: 'statsRecords',
              path: 'values.{field}',
            },
            layer: 'baseline',
            priority: 0,
            audit,
            inputs: preparedInputs,
            when: always,
            operation: operation(
              'select-packed-statistic-value',
              {
                expression:
                  'Select packedRecord.values[field] using the release-specific field selector. The record packing stage has already converted the contributing publisher literal and checked duplicate fields and definition hashes.',
                implementation: {
                  path: 'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts',
                  symbol: 'normaliseStatistics',
                },
              },
              preparedInputs,
            ),
            onAbsent: 'omit',
            onFailure: 'error',
          })
          inputs.preparedValue = prepared
          delete inputs.input0
          assemblyOperation = { kind: 'copy', input: 'preparedValue' }
        } else if (
          datasetCode === 'ds-hk-saanseoi-division' &&
          /^attributes\.i18n\.[^.]+\.name$/.test(first.apiField)
        ) {
          for (const input of Object.values(inputs))
            if ('node' in input) input.role = 'evidence'
          inputs.preparedRecord = curatedRecord(scope)
          assemblyOperation = operation(
            'saanseoi-division-name',
            operationCatalogue.operations['saanseoi-division-name'],
            inputs,
          )
        } else if (
          datasetCode === 'ds-hk-hkgov-pland-division-pu' &&
          first.resourceType === 'divisionArea' &&
          first.apiField === 'attributes.geometry'
        ) {
          for (const input of Object.values(inputs)) input.role = 'evidence'
          const preparationInputs: Node['inputs'] = {
            cells: {
              stage: 'raw',
              scope: scope.raw,
              collection: 'planningCells',
              path: 'features',
              role: 'value',
            },
            sourceVersion: {
              stage: 'registry',
              scope: scope.id,
              collection: 'sourceRelease',
              path: 'sourceVersion',
              role: 'condition',
            },
            sourceFormat: {
              stage: 'registry',
              scope: scope.raw,
              collection: 'assetManifest',
              path: 'format',
              role: 'selection',
            },
          }
          inputs.preparedGeometry = addNode({
            id: `${fieldId}-${scope.id}-planning-preparation`,
            stage: 'preparation',
            output: {
              scope: scope.prepared,
              collection: 'planningDivisions',
              path: 'geometry',
            },
            layer: 'baseline',
            priority: 0,
            audit,
            inputs: preparationInputs,
            when: always,
            operation: operation(
              'planning-unit-geometry',
              operationCatalogue.operations['planning-unit-geometry'],
              preparationInputs,
            ),
            onAbsent: 'error',
            onFailure: 'error',
          })
          assemblyOperation = operation(
            'materialise-planning-geometry',
            {
              steps: [
                'Parse the prepared geometry.',
                'Require Polygon or MultiPolygon.',
                'Apply geometry validity validation when requested.',
                'Remove embedded bbox; bbox is a separate canonical output.',
              ],
              implementation: {
                path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
                symbol: 'normaliseDivisionAreaGeometry',
              },
            },
            inputs,
          )
        }
        if (
          assemblyOperation.kind === 'unresolved' ||
          (direct && assemblyOperation.kind === 'copy')
        ) {
          const specification = currentFieldRule(
            first.resourceType,
            first.apiField,
            datasetCode,
          )
          if (specification) {
            // Old fixture dependencies remain evidence; the executor contract names the consumed inputs.
            for (const input of Object.values(inputs)) input.role = 'evidence'
            for (const path of specification.inputs)
              inputs[path] = compilePreparedFieldInput(
                path,
                preparedContext(scope, datasetCode, first.resourceType),
              )
            assemblyOperation = operation(
              `${first.resourceType}:${first.apiField}`,
              specification,
              inputs,
            )
          }
        }
        // These dependencies describe a transformation, not competing priority candidates.
        if (assemblyOperation.kind === 'resolver') {
          assemblyOperation.parameters = {
            datasetCode,
            sourceSchemaVersion: scope.source.sourceSchemaVersion,
            resourceType: first.resourceType,
            outputPath: output.path,
            apiField: first.apiField,
            variant: first.variant,
            capturedDefinitionIds: pins.map(pin => pin.definitionHash),
          }
        }
        const selectedSource: FieldRef = {
          stage: 'registry',
          scope: 'registry',
          collection: 'lineageContext',
          path: 'selectedSourceScope',
          role: 'selection',
        }
        inputs.selectedSource = selectedSource
        const nodeId = `${fieldId}-${scope.id}-assembly`
        addNode({
          id: nodeId,
          stage: 'assembly',
          output,
          layer: 'baseline',
          priority: 0,
          audit,
          inputs,
          when: {
            kind: 'compare',
            input: 'selectedSource',
            operator: 'eq',
            value: scope.id,
          },
          operation: assemblyOperation,
          onAbsent: 'omit',
          onFailure: 'error',
        })
        const displayTransform = geometryDisplayTransform(
          first.resourceType,
          first.apiField,
          first.variant,
        )
        if (displayTransform) {
          const displayInputs: Node['inputs'] = {
            normalisedValue: { node: nodeId, role: 'value' },
            coverage: compilePreparedFieldInput(
              'normalisedAreaCoverage',
              preparedContext(scope, datasetCode, first.resourceType),
            ),
            selectedSource,
          }
          const displayId = `${nodeId}-display`
          addNode({
            id: displayId,
            stage: 'assembly',
            output,
            layer: 'baseline',
            priority: 0,
            audit,
            inputs: displayInputs,
            when: {
              kind: 'compare',
              input: 'selectedSource',
              operator: 'eq',
              value: scope.id,
            },
            operation: operation(
              'simplified-area-display',
              displayTransform,
              displayInputs,
            ),
            onAbsent: 'error',
            onFailure: 'error',
          })
          candidates.push(displayId)
        } else candidates.push(nodeId)
        if (
          first.resourceType === 'division' &&
          datasetCode === 'ds-hk-overture-division'
        ) {
          const baseline = definition.nodes.find(node => node.id === nodeId)!
          for (const override of divisionOverrideNodes({
            baseline,
            apiField: first.apiField,
            sourceScope: scope.id,
            preparedScope: scope.prepared,
            operation,
            retain,
            addGroup: group => definition.resolutionGroups.push(group),
          })) {
            addNode(override)
            candidates.push(override.id)
          }
        }
      }
    }
    const groupId = `${fieldId}-value`
    definition.resolutionGroups.push({
      id: groupId,
      output,
      candidates,
      evaluation: 'per-record',
      keyInputs: [
        {
          stage: 'canonical',
          scope: canonical,
          collection: first.resourceType,
          path: 'id',
          role: 'join-key',
        },
      ],
    })
    const inputs: Node['inputs'] = { value: { group: groupId, role: 'value' } }
    const terminal = `${fieldId}-composition`
    const response = compileResponseField({
      apiVersion: context.api.version,
      resourceType: first.resourceType,
      apiField: first.apiField,
      inputs,
      operation,
    })
    addNode({
      id: terminal,
      stage: 'composition',
      output: {
        scope: 'response',
        collection: first.resourceType,
        path: first.apiField,
      },
      layer: 'baseline',
      priority: 0,
      audit: { ...audit, retention: 'definition-only' },
      inputs,
      when: response.when,
      operation: response.operation,
      onAbsent: response.onAbsent,
      onFailure: 'error',
    })
    definition.fields.push({
      resourceType: first.resourceType,
      apiField: first.apiField,
      ...(first.variant ? { variant: first.variant } : {}),
      emitWhen: response.when,
      terminalNode: terminal,
      provenance: fieldLineageClosure(definition, terminal),
      completeness: Object.values(fieldLineageClosure(definition, terminal))
        .flat()
        .every(id => {
          const node = definition.nodes.find(node => node.id === id)!
          return (
            node.operation.kind !== 'unresolved' &&
            node.when.kind !== 'unresolved' &&
            !Object.values(node.inputs).some(
              input =>
                'stage' in input &&
                input.stage === 'prepared' &&
                input.role !== 'evidence',
            )
          )
        })
        ? 'complete'
        : 'unknown-upstream',
      ...(first.apiField === 'attributes.values.{field}'
        ? {
            dynamicSelectors: [
              {
                parameter: 'field',
                scopeId: canonical,
                domainRole: 'statistic-fields',
                recordBinding: {
                  collection: 'statsRecords',
                  hashPath: 'fieldDefinitionHashes',
                  keyPath: 'values',
                },
              },
            ],
          }
        : /^attributes\.i18n\.\*\./.test(first.apiField)
          ? {
              dynamicSelectors: [
                {
                  parameter: 'locale',
                  scopeId: canonical,
                  domainRole: 'snapshot-locales',
                  recordBinding: { collection: first.resourceType, keyPath: 'i18n' },
                },
              ],
            }
          : {}),
    })
  }
  definition.nodes.sort((a, b) => a.id.localeCompare(b.id))
  definition.scopes.sort((a, b) => a.id.localeCompare(b.id))
  definition.sourceSchemas.sort((a, b) => a.scopeId.localeCompare(b.scopeId))
  validateFieldLineageDefinition(definition)
  const id = computeVersionHash(definition)
  binding.definitionId = id
  validateFieldLineageBinding(definition, binding)
  return { id, definition, binding }
}
