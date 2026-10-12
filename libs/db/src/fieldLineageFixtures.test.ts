import { expect, test } from 'bun:test'
import { listApiFieldFixtures } from './apiFieldFixtures'
import { compileAuthoringFieldLineage } from './fieldLineageAuthoring'
import { validateFieldLineageDefinition } from './fieldLineageGraph'

// These contexts exercise authoring coverage; they do not represent a published release.
for (const fixture of listApiFieldFixtures()) {
  test(`compile authored ${fixture.apiVersion}/${fixture.domainCode}/${fixture.mappingVersion}`, () => {
    const results = compileAuthoringFieldLineage(fixture)
    const authoredFields = results.flatMap(result => result.fields)
    expect(authoredFields).toHaveLength(fixture.fields.length)
    expect(new Set(authoredFields)).toEqual(new Set(fixture.fields))
    for (const result of results) {
      const resourceType = result.fields[0]!.resourceType
      expect(result.fields.every(field => field.resourceType === resourceType)).toBe(
        true,
      )
      for (const scope of result.definition.scopes) {
        if (scope.kind === 'source-release')
          expect(scope.resourceType).toBe(
            resourceType.startsWith('statistic') ? 'divisionStatistic' : resourceType,
          )
      }
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
    }
  })
}
