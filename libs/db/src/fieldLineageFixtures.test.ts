import { expect, test } from 'bun:test'
import { listApiFieldFixtures } from './apiFieldFixtures'
import { resolveApiResponseFields } from './apiResponseFields'
import { compileFieldLineage } from './fieldLineageCompiler'
import { validateFieldLineageDefinition } from './fieldLineageGraph'

// These contexts exercise authoring coverage; they do not represent a published release.
for (const fixture of listApiFieldFixtures()) {
  test(`compile authored ${fixture.apiVersion}/${fixture.domainCode}/${fixture.mappingVersion}`, () => {
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
    const result = compileFieldLineage(
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
        apiReleaseSetId: 'test-release',
        apiVersionReleaseSetId: 'test-version-release',
        responseDefinition: resolveApiResponseFields(
          fixture.apiVersion,
          fixture.schemaVersion,
        ),
        sources: datasets.map(datasetCode => ({
          sourceDatasetId: datasetCode,
          datasetCode,
          sourceSchemaVersion: fixture.publisherSchemaRanges[datasetCode]!.min,
          resourceReleaseId: `test-source-${datasetCode}`,
          processingRules: null,
        })),
        snapshots: resources.map(resourceType => ({
          resourceType,
          snapshotId: `test-snapshot-${resourceType}`,
        })),
      },
    )
    validateFieldLineageDefinition(result.definition)
    expect(result.definition.fields.length).toBeGreaterThan(0)
    for (const node of result.definition.nodes) {
      if (
        node.operation.kind === 'resolver' &&
        node.operation.definition.operationCode === 'division-geometry-type'
      ) {
        expect(node.inputs.class).toBeDefined()
        expect(node.inputs.isLand?.role).toBe('condition')
        expect(node.inputs.isTerritorial?.role).toBe('condition')
      }
    }
    for (const field of result.definition.fields) {
      expect(field.completeness).toBe('complete')
      expect(field.provenance.composition).toHaveLength(1)
      if (field.resourceType === 'statistic') {
        expect(field.completeness).toBe('complete')
        const closure = Object.values(field.provenance)
          .flat()
          .map(id => result.definition.nodes.find(node => node.id === id)!)
        expect(
          closure.some(
            node =>
              node.operation.kind === 'resolver' &&
              node.operation.definition.operationCode === 'statistic-packedRecord',
          ),
        ).toBe(true)
      }
      if (
        field.resourceType === 'divisionArea' &&
        field.variant?.endsWith(':simplified') &&
        ['attributes.geometry', 'attributes.bbox'].includes(field.apiField)
      ) {
        const nodes = field.provenance.assembly.map(
          id => result.definition.nodes.find(node => node.id === id)!,
        )
        const display = nodes.find(
          node =>
            node.operation.kind === 'resolver' &&
            node.operation.definition.operationCode === 'simplified-area-display',
        )
        expect(display).toBeDefined()
        expect(display!.inputs.normalisedValue).toHaveProperty('node')
        expect(display!.inputs.coverage).toBeDefined()
        const coverage = display!.inputs.coverage!
        if ('node' in coverage)
          expect(
            result.definition.nodes.find(node => node.id === coverage.node)?.output
              .path,
          ).toBe('normalisedAreaCoverage')
        else
          expect(coverage).toMatchObject({
            stage: 'prepared',
            path: 'normalisedAreaCoverage',
          })
        const document =
          result.definition.definitions[
            display!.operation.kind === 'resolver'
              ? display!.operation.definition.definitionId
              : ''
          ]
        expect(document).toMatchObject({ toleranceMetres: 10 })
      }
      if (field.completeness === 'complete') {
        const nodes = Object.values(field.provenance)
          .flat()
          .map(id => result.definition.nodes.find(node => node.id === id)!)
        expect(nodes.every(node => node.operation.kind !== 'unresolved')).toBe(true)
        expect(
          nodes.every(
            node =>
              !Object.values(node.inputs).some(
                input =>
                  'stage' in input &&
                  input.stage === 'prepared' &&
                  input.role !== 'evidence',
              ),
          ),
        ).toBe(true)
      }
    }
  })
}
