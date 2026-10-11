import { expect, test } from 'bun:test'
import { divisionCuration, editionGeometry } from './curationInputs'

test('Four Little Dragons drawing applies only to editions containing its identity', () => {
  const id = '15062812-a4d2-4d4a-b589-2f50bc31943f'
  const drawing = divisionCuration.geometry.features.find(
    feature => feature.properties.divisionId === id,
  )!
  expect(drawing.properties.corePoint).toBeDefined()
  expect(editionGeometry(new Set()).features).toEqual([])
  expect(editionGeometry(new Set([id])).features).toEqual([drawing])
  expect(divisionCuration.geometry.features).toContain(drawing)
})
