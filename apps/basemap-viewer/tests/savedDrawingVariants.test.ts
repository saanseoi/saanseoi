import { expect, test } from 'vitest'
import { upgradeSavedDrawingVariants } from '../src/local-review/division-areas/savedDrawingVariants'

test('saved active and withheld drawings upgrade without modifying originals or provenance', () => {
  const feature = {
    id: 'stub:one',
    properties: { variant: 'stub', copiedFrom: 'stub', corePoint: [114, 22] },
    geometry: { type: 'Polygon', coordinates: [[[114, 22]]] },
  }
  const saved = {
    variant: 'stub',
    features: [feature],
    withheld: [{ feature, reason: 'held' }],
  }
  const upgraded = upgradeSavedDrawingVariants(saved)
  expect(upgraded.variant).toBe('saanseoi')
  expect(upgraded.features[0].properties.variant).toBe('saanseoi')
  expect(upgraded.withheld[0].feature.properties.variant).toBe('saanseoi')
  expect(upgraded.features[0].geometry).toEqual(feature.geometry)
  expect(upgraded.features[0].properties.corePoint).toEqual([114, 22])
  expect(upgraded.features[0].properties.copiedFrom).toBe('stub')
  expect(upgraded.features[0].id).toBe('stub:one')
  expect(saved.features[0].properties.variant).toBe('stub')
  expect(upgradeSavedDrawingVariants(upgraded)).toEqual(upgraded)
})
