import { expect, test } from 'bun:test'
import type { ProvenanceStore } from '@repo/core/provenance'
import { retainDivisionProvenance } from './divisionProvenance'
import { syntheticHongKongAreaRule } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'

test('retains synthetic Hong Kong area inputs and outputs independently', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const value = objects.get(key)
      return value ? { arrayBuffer: async () => value } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
  const districts = Array.from({ length: 18 }, (_, index) => `district-${index}`)
  const actions = [
    districts.slice(0, 4),
    districts.slice(4, 9),
    districts.slice(9),
  ].map((districtDivisionIds, index) => ({
    action: syntheticHongKongAreaRule.declaration.id,
    affectedRecordCount: 1,
    evidence: { districtDivisionIds },
    mode: 'automatic' as const,
    summary: `Synthesised area ${index}`,
  }))

  const retained = await retainDivisionProvenance(store, {
    releaseId: 'release',
    datasetCode: 'overture-hk-division-area',
    inputCount: 141,
    outputCount: 144,
    actions,
  })

  expect(
    retained.manifest.bulk.find(
      rule => rule.id === syntheticHongKongAreaRule.declaration.id,
    )?.counts,
  ).toMatchObject({
    inputs: { 'district-land-geometries': 18, 'exclusion-area': 1 },
    outputs: { divisionAreas: 3 },
    recordsAffected: 3,
  })
})
