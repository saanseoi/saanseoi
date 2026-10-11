import { expect, test } from 'bun:test'
import { createMemoryProvenanceStore } from '../../../../../libs/core/src/testing/provenanceStore'
import { verifyAuditResult } from '@repo/core/provenance'
import { retainProducerAudit } from './producerAudit'

test('producer separates preparation guards from the canonical output audit', async () => {
  const { store } = createMemoryProvenanceStore()
  const result = await retainProducerAudit(store, {
    scope: { stage: 'assembly', ownerId: 'snapshot' },
    resourceReleaseId: 'source',
    datasetCode: 'dataset',
    rules: [],
    guards: [
      {
        scope: { stage: 'preparation', ownerId: 'source' },
        id: 'review',
        summary: 'Review source preparation',
        status: 'passed',
        consequence: 'block-ingestion',
        checked: 3,
        failed: 0,
        reason: 'Reviewed inputs',
      },
    ],
  })
  expect(result.manifest.scope).toEqual({ stage: 'assembly', ownerId: 'snapshot' })
  expect(result.manifest.guards).toEqual([])
  expect(result.additional).toHaveLength(1)
  expect(result.additional[0]!.manifest.scope).toEqual({
    stage: 'preparation',
    ownerId: 'source',
  })
  expect(result.additional[0]!.manifest.guards[0]).not.toHaveProperty('scope')
  await verifyAuditResult(store, result.manifest)
  await verifyAuditResult(store, result.additional[0]!.manifest)
})

test('preparation retains branch definitions and counters for the mapping widgets', async () => {
  const { store } = createMemoryProvenanceStore()
  const { preparationRulesDeclaration } = await import(
    '../pipeline/curatedDivisions/preparationRules'
  )
  const { createBranchCounts, readObject } = await import('@repo/core/provenance')
  const branches = createBranchCounts(preparationRulesDeclaration.branches!)
  branches['level.locality.hamlet'] = { matched: 2, changed: 1 }
  const result = await retainProducerAudit(store, {
    scope: { stage: 'preparation', ownerId: 'source' },
    resourceReleaseId: 'source',
    datasetCode: 'ds-hk-saanseoi-division',
    rules: [
      {
        declaration: preparationRulesDeclaration,
        inputs: { 'overture-divisions': 2 },
        outputs: { 'prepared-divisions': 2 },
        recordsAffected: 2,
        decisions: {},
        branches,
      },
    ],
    guards: [],
  })
  await verifyAuditResult(store, result.manifest)
  expect(result.manifest.bulk[0]!.counts.branches).toEqual(branches)
  expect(await readObject(store, result.manifest.bulk[0]!.definition)).toMatchObject({
    branches: preparationRulesDeclaration.branches,
  })
})
