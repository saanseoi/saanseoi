import { expect, test } from 'bun:test'
import { divisionExclusionFixture } from './divisionExclusionPatch'
import { retainDivisionProvenance } from './divisionProvenance'
import { readAuditPage } from '../../../provenance/audit'
import type { ProvenanceStore } from '../../../provenance'

test('every reviewed exclusion retains its individual fixture and reason', async () => {
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
  const entries = divisionExclusionFixture.entries
  const result = await retainDivisionProvenance(store, {
    resourceReleaseId: 'release',
    datasetCode: 'ds-hk-overture-division',
    inputCount: entries.length,
    outputCount: 0,
    actions: entries.map(entry => ({
      action: entry.id,
      affectedRecordCount: 1,
      mode: 'manual',
      summary: 'Excluded reviewed Overture division from canonical records.',
      evidence: { divisionId: entry.divisionId },
    })),
  })
  for (const entry of entries) {
    const page = await readAuditPage(store, result.manifest, entry.names[0]!, 0, 100, {
      category: 'patches',
    })
    expect(page.rows.find(row => row.operation === entry.id)).toMatchObject({
      reason: entry.reason,
      fixture: { pointer: '' },
      record: { id: entry.divisionId, names: entry.names },
    })
  }
})
