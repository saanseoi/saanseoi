import { expect, test } from 'bun:test'
import type { ProvenanceStore } from '@repo/core/provenance'
import { retainDivisionProvenance } from './divisionProvenance'
import { readAuditPage } from '@repo/core/provenance'
import { divisionAreaGeometryRule } from '@repo/core/pipeline/services/divisionGeometry'
import { overtureHongKongAreaGeometryPatchDeclaration } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'

test('unknown operations cannot silently disappear into normalisation counters', async () => {
  let writes = 0
  const store: ProvenanceStore = {
    async get() {
      return null
    },
    async put() {
      writes++
    },
  }
  for (const action of ['new_operation', 'unknown_name_human_translated']) {
    await expect(
      retainDivisionProvenance(store, {
        releaseId: 'release',
        datasetCode: 'division',
        inputCount: 1,
        outputCount: 1,
        actions: [
          {
            action,
            affectedRecordCount: 1,
            mode: 'automatic',
            summary: 'Unknown',
            evidence: null,
          },
        ],
      }),
    ).rejects.toThrow('Unregistered Division audit operation')
  }
  expect(writes).toBe(0)
})

test('retains synthetic Hong Kong area rows as individual patches', async () => {
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
    action: overtureHongKongAreaGeometryPatchDeclaration.id,
    affectedRecordCount: 1,
    evidence: {
      divisionId: `area-${index}`,
      names: [`Area ${index}`],
      reason: 'Restore area geometry.',
      input: { districtDivisionIds },
      output: { id: `area-row-${index}`, divisionId: `area-${index}` },
    },
    mode: 'automatic' as const,
    summary: `Synthesised area ${index}`,
  }))

  const retained = await retainDivisionProvenance(store, {
    releaseId: 'release',
    datasetCode: 'overture-hk-division-area',
    inputCount: 141,
    outputCount: 141,
    normalisation: divisionAreaGeometryRule.declaration,
    actions,
  })

  expect(
    retained.manifest.bulk.find(rule => rule.id === 'normalise-division-area-geometry')
      ?.counts,
  ).toMatchObject({
    inputs: { 'source-geometry': 141 },
    outputs: { divisionAreas: 141 },
    recordsAffected: 141,
  })
  expect(retained.manifest.applicationCount).toBe(3)
  const patches = await readAuditPage(store, retained.manifest, '', 0, 50, {
    category: 'patches',
  })
  expect(patches.rows).toHaveLength(3)
})
