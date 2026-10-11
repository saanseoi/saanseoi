import { expect, test } from 'bun:test'
import { compileFieldLineage } from '../../../db/src/fieldLineageCompiler'
import { evaluateFieldLineageCondition } from '../../../db/src/fieldLineageConditions'
import { selectFieldLineageCandidate } from '../../../db/src/fieldLineageGraph'
import { computeVersionHash } from '@repo/db'
import { divisionFieldLineagePredicate } from './fieldLineagePredicates'
import patches from '../../../../fixtures/meta/patches/overture-division-classification.json'
import { prepareCuratedDivisionRow } from '../pipeline/services/divisions/division'

const response = { nameAlts: 'division.i18n.*.nameAlts' }
function graph(apiField: string) {
  return compileFieldLineage(
    [
      {
        resourceType: 'division',
        apiField,
        variant: null,
        sourceDatasetId: 'dataset',
        inputs: [{ origin: 'source', fieldPath: 'properties.names' }],
        canonicalInputs: [apiField.replace('attributes.', 'division.')],
        resolverCode: 'normalise-divisions',
        contributionType: 'primary',
        priority: 0,
        confidence: 1,
        resolverRules: [],
      },
    ],
    new Map([['dataset', { 'properties.names': 'names' }]]),
    {
      api: {
        version: 'api-divisions-v0.2',
        responseSchemaVersion: 'schema',
        responseSchemaHash: computeVersionHash(response),
      },
      apiReleaseSetId: 'release',
      apiVersionReleaseSetId: 'version',
      responseDefinition: response,
      sources: [
        {
          sourceDatasetId: 'dataset',
          datasetCode: 'ds-hk-overture-division',
          sourceSchemaVersion: '1.12.0',
          resourceReleaseId: 'source',
          processingRules: null,
        },
      ],
      snapshots: [{ snapshotId: 'snapshot', resourceType: 'division' }],
    },
  )
}
test('automatic alias applicability uses the executor normalisation and retains counts only', () => {
  const { definition } = graph('attributes.i18n.*.nameAlts')
  const node = definition.nodes.find(node => node.layer === 'conditional-rule')!
  const scope = definition.sourceSchemas[0]!.scopeId
  const evaluate = (locale: string, name: string) =>
    evaluateFieldLineageCondition(
      node.when,
      {
        selectedSource: scope,
        recordId: 'unreviewed',
        publisherNames: { common: { en: name } },
        locale,
      },
      (ref, args) => divisionFieldLineagePredicate(definition, ref, args),
    )
  expect(evaluate('en', 'Example Tsuen')).toBe(true)
  expect(evaluate('en', 'Example Village')).toBe(false)
  expect(evaluate('zh-hant', 'Example Tsuen')).toBe(false)
  expect(node.audit).toEqual({ category: 'rules', scope: 'bulk', retention: 'counts' })
})
test('the generated patch candidate agrees with the current classification executor, including nullable levels', () => {
  const { definition } = graph('attributes.level')
  const scope = definition.sourceSchemas[0]!.scopeId
  const candidates = definition.nodes.filter(
    node => node.stage === 'assembly' && node.output.path === 'level',
  )
  for (const entry of patches.entries) {
    const winner = selectFieldLineageCandidate(candidates, node =>
      evaluateFieldLineageCondition(node.when, {
        selectedSource: scope,
        recordId: entry.divisionId,
      }),
    )!
    expect(winner.layer).toBe('patch')
    expect(winner.audit.retention).toBe('decision')
    const actual = prepareCuratedDivisionRow(
      {
        id: entry.divisionId,
        class: 'region',
        subtype: 'district',
        admin_level: 1,
        names: { primary: entry.names[0] },
        hierarchies: [],
        geometry: null,
      },
      {
        deferHierarchyGuard: true,
        source: { source: 'overture', sourceVersion: '2026-09-23.0' },
      },
    )
    expect(actual.base.level).toBe(entry.replacement.level)
  }
})
