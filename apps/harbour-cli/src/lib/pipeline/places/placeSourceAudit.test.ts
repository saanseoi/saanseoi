import { expect, test } from 'bun:test'
import { readObject, verifyAuditResult } from '@repo/core/provenance'
import { retainDivisionSourceAudit } from '../divisions/divisionSourceAudit'
import { retainPlaceSourceAudit } from './placeSourceAudit'

test.each([0, 7])(
  'Places source audit follows Overture source retention for %i retained records',
  async retainedCount => {
    const objects = new Map<string, ArrayBuffer>()
    const store = {
      async get(key: string) {
        const bytes = objects.get(key)
        return bytes ? { arrayBuffer: async () => bytes } : null
      },
      async put(key: string, bytes: ArrayBuffer) {
        objects.set(key, bytes)
      },
    }
    const result = await retainPlaceSourceAudit(store, {
      resourceReleaseId: 'place-resource-release',
      datasetCode: 'ds-hk-overture-place',
      retainedCount,
    })
    const division = await retainDivisionSourceAudit(store, {
      resourceReleaseId: 'division-resource-release',
      datasetCode: 'ds-hk-overture-division',
      source: 'overture',
      inputCount: retainedCount,
    })
    await verifyAuditResult(store, result.manifest)
    expect(result.manifest.scope).toEqual({
      stage: 'ingestion',
      ownerId: 'place-resource-release',
    })
    expect(result.manifest.datasetCode).toBe('ds-hk-overture-place')
    expect(result.manifest.attempt.status).toBe('completed')
    expect(result.manifest.bulk).toEqual(division.manifest.bulk)
    expect(result.manifest.guards).toEqual(division.manifest.guards)
    expect(result.manifest.bulk[0]!.counts).toEqual({
      inputs: { 'publisher-feature': retainedCount },
      outputs: { 'source-assertion': retainedCount },
      recordsAffected: retainedCount,
      decisions: { retained: retainedCount },
    })
    expect(await readObject(store, result.manifest.bulk[0]!.definition)).toMatchObject({
      id: 'retain-overture-source',
    })
    expect(result.manifest.applicationCount).toBe(0)
    expect(result.manifest.chunks).toHaveLength(0)
  },
)
