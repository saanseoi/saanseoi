import { expect, test } from 'bun:test'
import { readObject, verifyAuditResult } from '@repo/core/provenance'
import { createMemoryProvenanceStore } from '../../../../../../libs/core/src/testing/provenanceStore'
import { retainDivisionSourceAudit } from './divisionSourceAudit'

const input = {
  resourceReleaseId: 'source-release',
  datasetCode: 'ds-hk-overture-division',
  source: 'overture',
  resourceType: 'divisionArea',
  sourceVersion: '2026-09-23.0',
  inputCount: 181,
  outputCount: 142,
}

test('retains exclusion counts and source mapping in ingestion without canonical normalisation', async () => {
  const { store } = createMemoryProvenanceStore()
  const excluded = Array.from({ length: 39 }, (_, i) => ({
    id: `area-${i}`,
    divisionId: `division-${i}`,
    divisionIds: null,
  }))
  const { manifest } = await retainDivisionSourceAudit(store, {
    ...input,
    excludedGeometry: excluded,
    guards: [
      {
        id: 'source-api-field-compatibility',
        summary: 'Checked schema',
        consequence: 'block-ingestion',
        status: 'passed',
        checked: 1,
        failed: 0,
        reason: 'Exact mapping',
      },
    ],
  })
  expect(manifest.scope).toEqual({ stage: 'ingestion', ownerId: 'source-release' })
  expect(manifest.bulk.map(rule => rule.id)).toEqual([
    'exclude-overture-guangdong-source-geometry',
    'retain-overture-source',
  ])
  const cut = manifest.bulk[0]!
  expect(cut.counts).toMatchObject({
    inputs: { 'prepared-records': 181 },
    outputs: { 'in-scope-records': 142 },
    recordsAffected: 39,
  })
  expect(cut.fixtures).toEqual([])
  expect(await readObject(store, cut.definition)).toMatchObject({
    parameters: {
      field: 'region',
      equals: 'CN-GD',
      resourceType: 'divisionArea',
      sourceVersion: '2026-09-23.0',
    },
    implementation: {
      symbol: 'processLocalDivisionGeometrySqlUpload',
      revision: expect.any(String),
    },
  })
  expect(manifest.bulk[1]!.counts).toMatchObject({
    inputs: { 'publisher-feature': 142 },
    outputs: { 'source-assertion': 142 },
  })
  expect(manifest.guards.map(guard => guard.id)).toEqual([
    'source-api-field-compatibility',
    'overture-source-payload-contract',
  ])
  await verifyAuditResult(store, manifest)
})

test('records an executed zero-exclusion check without claiming an exclusion', async () => {
  const { store } = createMemoryProvenanceStore()
  const { manifest } = await retainDivisionSourceAudit(store, {
    ...input,
    inputCount: 142,
    excludedGeometry: [],
  })
  expect(manifest.bulk[0]).toMatchObject({
    outcome: 'not-applicable',
    fixtures: [],
    counts: { recordsAffected: 0 },
  })
  await verifyAuditResult(store, manifest)
})

test('does not invent extraction or filter execution for an already prepared input', async () => {
  const { store } = createMemoryProvenanceStore()
  const { manifest } = await retainDivisionSourceAudit(store, {
    ...input,
    inputCount: 142,
  })
  expect(manifest.bulk.map(rule => rule.id)).toEqual(['retain-overture-source'])
  expect(
    manifest.guards.some(guard => guard.id === 'source-api-field-compatibility'),
  ).toBe(false)
})

test('keeps non-Overture retention independent of Overture checks', async () => {
  const { store } = createMemoryProvenanceStore()
  const { manifest } = await retainDivisionSourceAudit(store, {
    ...input,
    source: 'saanseoi',
    inputCount: 142,
  })
  expect(manifest.bulk.map(rule => rule.id)).toEqual(['retain-division-source-records'])
  expect(manifest.guards).toEqual([])
})
