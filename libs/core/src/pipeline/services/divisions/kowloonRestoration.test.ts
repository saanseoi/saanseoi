import { expect, test } from 'bun:test'
import {
  kowloonRestorationActions,
  kowloonRestorationFixture,
} from './kowloonRestoration'
import {
  missingOvertureHongKongAreaRows,
  overtureHongKongAreas,
} from './overtureHongKongAreas'
import { retainDivisionProvenance } from './divisionProvenance'
import { readAuditPage } from '../../../provenance/audit'
import type { ProvenanceStore } from '../../../provenance'

const message = { source: 'overture', type: 'division', regionCode: 'hk' } as const
const districts = overtureHongKongAreas.flatMap(area =>
  area.districtNames.map(name => ({ id: name, names: name })),
)

test('restoration applies only when Kowloon is absent from the source release', () => {
  const actions = kowloonRestorationActions(
    districts,
    missingOvertureHongKongAreaRows(message, districts),
  )
  expect(actions).toHaveLength(1)
  expect(actions[0]?.evidence).toMatchObject({
    decision: 'restore-missing-source-row',
    divisionId: kowloonRestorationFixture.divisionId,
  })

  const pointRows = [
    ...districts,
    {
      id: kowloonRestorationFixture.divisionId,
      names: 'Kowloon',
      geometry: { type: 'Point', coordinates: [114, 22] },
    },
  ]
  expect(missingOvertureHongKongAreaRows(message, pointRows)).not.toContainEqual(
    expect.objectContaining({ id: kowloonRestorationFixture.divisionId }),
  )
  expect(kowloonRestorationActions(pointRows, [])).toEqual([])

  const rows = [
    ...districts,
    { id: kowloonRestorationFixture.divisionId, geometry: { type: 'Polygon' } },
  ]
  expect(
    kowloonRestorationActions(rows, missingOvertureHongKongAreaRows(message, rows)),
  ).toEqual([])
  expect(
    missingOvertureHongKongAreaRows({ ...message, type: 'divisionArea' }, districts),
  ).toEqual([])
  expect(() => missingOvertureHongKongAreaRows(message, [])).toThrow(
    'Cannot synthesise',
  )
})

test('retains a searchable individual restoration only when ingestion supplied evidence', async () => {
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
  const actions = kowloonRestorationActions(
    districts,
    missingOvertureHongKongAreaRows(message, districts),
  )
  for (const retainedActions of [actions, []]) {
    const result = await retainDivisionProvenance(store, {
      releaseId: 'release',
      datasetCode: 'ds-hk-overture-division',
      inputCount: 18,
      outputCount: 21,
      actions: retainedActions,
    })
    const page = await readAuditPage(store, result.manifest, 'Kowloon', 0, 50, {
      category: 'patches',
    })
    expect(page.rows).toHaveLength(retainedActions.length)
    if (retainedActions.length)
      expect(page.rows[0]).toMatchObject({
        operation: kowloonRestorationFixture.id,
        fixture: { pointer: '' },
        record: { id: kowloonRestorationFixture.divisionId },
        context: { decision: 'restore-missing-source-row' },
      })
  }
})
