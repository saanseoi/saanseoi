import { expect, test } from 'bun:test'
import { preprocessingContext } from './preprocessingContext'
import type { CuratedSourceRelease } from './archiveInput'
const pin: CuratedSourceRelease = {
  datasetCode: 'ds-hk-overture-division',
  releaseCode: 'release',
  sourceVersion: 'version',
  resourceType: 'division',
  rawObjectKey: 'source',
  contentHash: 'hash',
  releaseNotesUrl: null,
}
test('retains native hierarchy, exact comparison pin and all contributing records', () => {
  const hierarchy = [{ division_id: 'parent', names: { primary: 'Lantau' } }]
  const inputs = { overture: ['x'], landsd: ['y'] }
  const context = preprocessingContext(
    { id: 'x', sources: JSON.stringify(inputs) },
    { id: 'x', hierarchies: hierarchy },
    pin,
  )
  expect(context.publisherHierarchy).toEqual(hierarchy)
  expect(context.inputs).toEqual(inputs)
  expect(context.comparison).toEqual({
    kind: 'overture',
    datasetCode: pin.datasetCode,
    releaseCode: pin.releaseCode,
    contentHash: pin.contentHash,
    recordId: 'x',
  })
})
test('combined inputs do not invent a single-record baseline', () => {
  const context = preprocessingContext({ id: 'x' }, undefined)
  expect(context.comparison).toEqual({ kind: 'combined-inputs' })
  expect(context).not.toHaveProperty('publisherHierarchy')
  expect(() => preprocessingContext({ id: 'x' }, { id: 'x' })).toThrow(
    'Missing comparison source pin',
  )
})
