import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import {
  readObject,
  verifyAuditResult,
  ruleDeclarationFromFixture,
  type ProvenanceStore,
} from '@repo/core/provenance'
import preparation from '../../../../../../fixtures/meta/processing-rules/address-preparation.json'
import curation from '../../../../../../fixtures/meta/processing-rules/address-curation.json'
import { retainAddressProvenance } from './addressProvenance'
import { alsAuditFixtures } from '../../sources/hkgov/dpo/hkgovAlsAuditFixtures'

test('ALS retains reviewed documents and an individual identity decision, with bulk evidence reduced to counts', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const result = await retainAddressProvenance(store, {
    releaseId: 'address-release',
    datasetCode: 'als-addresses',
    outputCount: 1,
    preparation: {
      schemaVersion: 1,
      sourceVersion: '2026-09-01.0',
      preparedSha256: 'test',
      divisionSnapshotId: 'division',
      sourceFeatureCount: 2,
      outputCount: 1,
      declarations: {
        preparation: ruleDeclarationFromFixture(preparation),
        curation: ruleDeclarationFromFixture(curation),
      },
      fixtures: alsAuditFixtures,
      processingActions: [
        {
          action: 'als_exact_source_duplicate_removed',
          mode: 'automatic',
          affectedRecordCount: 1,
          summary: 'Consolidate duplicates.',
          evidence: { publisher: 'TRANSIENT_PUBLISHER_PAYLOAD' },
        },
        {
          action: 'als_identity_drift_decision',
          mode: 'manual',
          affectedRecordCount: 1,
          summary: 'Retain reviewed identity.',
          evidence: {
            canonicalRecord: {
              canonicalId: 'address-1',
              formattedAddress: { en: 'Example House' },
            },
            decision: {
              currentIdentityKey: 'current',
              previousIdentityKey: 'previous',
              resolution: 'keep-existing-id',
            },
          },
        },
      ],
    },
  })
  await verifyAuditResult(store, result.manifest)
  expect(result.manifest.applicationCount).toBe(1)
  expect(
    result.manifest.bulk[0]?.counts.decisions.als_exact_source_duplicate_removed,
  ).toBe(1)
  expect(result.manifest.bulk[1]?.fixtures.length).toBeGreaterThanOrEqual(
    alsAuditFixtures.length,
  )
  const text = [...objects.values()].map(b => new TextDecoder().decode(b)).join('')
  expect(text).not.toContain('TRANSIENT_PUBLISHER_PAYLOAD')
  const chunk = await readObject(store, requireDefined(result.manifest.chunks[0]))
  expect(chunk).toMatchObject({
    actions: [
      {
        record: { id: 'address-1', names: ['Example House'] },
        fixture: { pointer: '/entries/0' },
      },
    ],
  })
})
