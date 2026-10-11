import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listApiFieldFixtures } from '../src/apiFieldFixtures'
import { computeVersionHash } from '../src/versioning'
import { resolveApiResponseFields } from '../src/apiResponseFields'
import { compileFieldLineage } from '../src/fieldLineageCompiler'

const root = resolve(import.meta.dir, '../../..')
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const operations = read('fixtures/meta/fieldLineage/operations.json')
const evidence = Object.fromEntries(
  Object.entries(operations.operations).map(([id, raw]) => {
    const operation = raw as {
      implementation: { path: string; symbol: string }
      additionalImplementations?: Array<{ path: string; symbol: string }>
    }
    const source = readFileSync(resolve(root, operation.implementation.path), 'utf8')
    if (!source.includes(operation.implementation.symbol))
      throw new Error(`Missing implementation ${id}`)
    return [
      id,
      {
        ...operation.implementation,
        dependencies: (operation.additionalImplementations ?? []).map(
          implementation => {
            const source = readFileSync(resolve(root, implementation.path), 'utf8')
            if (!source.includes(implementation.symbol))
              throw new Error(`Missing implementation ${implementation.symbol}`)
            return {
              ...implementation,
              sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`,
            }
          },
        ),
        sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`,
      },
    ]
  }),
)
const fixtures = listApiFieldFixtures()
const fields = fixtures.flatMap(fixture => {
  // Deliberately synthetic authoring context: never save this graph as release lineage.
  const datasets = [...new Set(fixture.fields.map(field => field.sourceDatasetCode))]
  const resources = [
    ...new Set(
      fixture.fields.map(field =>
        field.resourceType.startsWith('statistic')
          ? 'divisionStatistic'
          : field.resourceType,
      ),
    ),
  ]
  const { definition: graph } = compileFieldLineage(
    fixture.fields.map(field => ({
      ...field,
      variant: field.variant ?? null,
      confidence: field.confidence ?? null,
      sourceDatasetId: field.sourceDatasetCode,
      resolverRules: [],
    })),
    new Map(Object.entries(fixture.publisherFields)),
    {
      api: {
        version: fixture.apiVersion,
        responseSchemaVersion: fixture.schemaVersion,
        responseSchemaHash: fixture.responseFieldsVersionHash,
      },
      apiReleaseSetId: 'authoring-only',
      apiVersionReleaseSetId: 'authoring-only',
      responseDefinition: resolveApiResponseFields(
        fixture.apiVersion,
        fixture.schemaVersion,
      ),
      sources: datasets.map(datasetCode => ({
        sourceDatasetId: datasetCode,
        datasetCode,
        sourceSchemaVersion: fixture.publisherSchemaRanges[datasetCode]!.min,
        resourceReleaseId: `authoring-${datasetCode}`,
        processingRules: null,
      })),
      snapshots: resources.map(resourceType => ({
        resourceType,
        snapshotId: `authoring-${resourceType}`,
      })),
    },
  )
  // Every retained implementation anchor is checked, including provider-specific contracts.
  for (const document of Object.values(graph.definitions)) {
    const spec = document as {
      implementation?: { path: string; symbol: string }
      additionalImplementations?: Array<{ path: string; symbol: string }>
    }
    if (!spec?.implementation) continue
    const implementations = [
      spec.implementation,
      ...(spec.additionalImplementations ?? []),
    ]
    const entries = implementations.map(implementation => {
      const source = readFileSync(resolve(root, implementation.path), 'utf8')
      if (!source.includes(implementation.symbol))
        throw new Error(
          `Missing lineage implementation ${implementation.path}:${implementation.symbol}`,
        )
      return {
        ...implementation,
        sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`,
      }
    })
    const primary = entries[0]!
    const key = `${primary.path}#${primary.symbol}`
    evidence[key] = {
      ...primary,
      dependencies: [
        ...new Map(
          [...(evidence[key]?.dependencies ?? []), ...entries.slice(1)].map(entry => [
            `${entry.path}#${entry.symbol}`,
            entry,
          ]),
        ).values(),
      ].sort((a, b) => `${a.path}#${a.symbol}`.localeCompare(`${b.path}#${b.symbol}`)),
    }
  }
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const grouped = new Map<string, typeof fixture.fields>()
  for (const field of fixture.fields) {
    const apiField =
      field.resourceType === 'statistic' &&
      field.apiField.startsWith('attributes.values.')
        ? 'attributes.values.{field}'
        : field.apiField
    const key = JSON.stringify([
      field.resourceType,
      apiField,
      field.variant,
      field.sourceDatasetCode,
    ])
    const values = grouped.get(key) ?? []
    values.push({ ...field, apiField })
    grouped.set(key, values)
  }
  return [...grouped.values()].map(values => {
    const field = values[0]!
    const plan = graph.fields.find(
      plan =>
        plan.resourceType === field.resourceType &&
        plan.apiField === field.apiField &&
        (plan.variant ?? null) === (field.variant ?? null),
    )!
    const assembly = plan.provenance.assembly
      .map(id => nodes.get(id)!)
      .find(node => {
        const condition = node.when
        return (
          node.output.scope === `canonical-${field.resourceType}` &&
          condition.kind === 'compare' &&
          graph.scopes.find(scope => scope.id === condition.value)?.datasetCode ===
            field.sourceDatasetCode
        )
      })!
    const composition = nodes.get(plan.terminalNode)!
    const operationName = (node: typeof composition) =>
      node.operation.kind === 'unresolved'
        ? null
        : node.operation.kind === 'resolver'
          ? node.operation.definition.operationCode
          : node.operation.kind
    const operation = operationName(assembly)
    return {
      apiVersion: fixture.apiVersion,
      domain: fixture.domainCode,
      mappingVersion: fixture.mappingVersion,
      fixtureHash: fixture.versionHash,
      resourceType: field.resourceType,
      apiField: field.apiField,
      variant: field.variant ?? null,
      sourceDatasetCode: field.sourceDatasetCode,
      assemblyOperation: operation,
      compositionOperation: operationName(composition),
      fieldStageOperationsAcrossSources: Object.fromEntries(
        Object.entries(plan.provenance).map(([stage, ids]) => [
          stage,
          [...new Set(ids.map(id => operationName(nodes.get(id)!)))],
        ]),
      ),
      status: operation
        ? 'assembly-specification-present'
        : 'field-specific-assembly-policy-required',
      completeness: plan.completeness,
      unresolvedPreparedInputsAcrossSources: [
        ...new Map(
          Object.values(plan.provenance)
            .flat()
            .flatMap(id =>
              Object.values(nodes.get(id)!.inputs).flatMap(input =>
                'stage' in input &&
                input.stage === 'prepared' &&
                input.role !== 'evidence'
                  ? [
                      [
                        JSON.stringify([input.scope, input.collection, input.path]),
                        {
                          scope: input.scope,
                          collection: input.collection,
                          path: input.path,
                        },
                      ] as const,
                    ]
                  : [],
              ),
            ),
        ).values(),
      ],
      upstream:
        plan.completeness === 'complete'
          ? 'current-code-stage-closure'
          : 'prepared-input-specification-required',
      resolverCodes: [...new Set(values.map(value => value.resolverCode))].sort(),
    }
  })
})
const plans = read('docs/reviews/field-lineage/field-plans.json')
const report = {
  kind: 'field-lineage-implementation-correspondence',
  schemaVersion: 1,
  scope: 'base-index-and-detail-resource-fields',
  deferredSurfaces: [
    'search',
    'changes',
    'geocoding',
    'source-records',
    'registry',
    'operational',
  ],
  operationCatalogueHash: computeVersionHash(operations),
  staticSelectorPlans: plans.plans.length,
  authoredSignatures: fixtures.length,
  fieldSourcePlans: fields.length,
  assemblySpecifications: fields.filter(field => field.assemblyOperation !== null)
    .length,
  unresolvedAssembly: fields.filter(field => field.assemblyOperation === null).length,
  unresolvedComposition: fields.filter(field => field.compositionOperation === null)
    .length,
  coverageBasis: 'compiled-synthetic-authoring-context-not-release-evidence',
  complete: fields.every(field => field.completeness === 'complete'),
  completeFieldSourcePlans: fields.filter(field => field.completeness === 'complete')
    .length,
  limitations: [
    'An assembly specification does not establish complete upstream materialisation or response emission conditions.',
    'The broader static schema inventory is reference material; deferred endpoints are outside this implementation pass.',
    'Prepared input references without transformation nodes remain incomplete current-code coverage; historical execution is not a prerequisite for implementing those nodes.',
  ],
  fields,
}
const outputs = [
  [
    'fixtures/meta/fieldLineage/implementation-evidence.json',
    {
      kind: 'field-lineage-implementation-evidence',
      schemaVersion: 1,
      implementations: evidence,
    },
  ],
  ['docs/reviews/field-lineage/correspondence.json', report],
] as const
for (const [path, value] of outputs) {
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (process.argv.includes('--check')) {
    if (readFileSync(resolve(root, path), 'utf8') !== text)
      throw new Error(`Stale lineage artefact: ${path}`)
  } else writeFileSync(resolve(root, path), text)
}
console.log(
  JSON.stringify({
    fieldSourcePlans: report.fieldSourcePlans,
    assemblySpecifications: report.assemblySpecifications,
    unresolvedAssembly: report.unresolvedAssembly,
    complete: report.complete,
  }),
)
