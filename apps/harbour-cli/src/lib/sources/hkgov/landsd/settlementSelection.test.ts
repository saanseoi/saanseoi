import { expect, test } from 'bun:test'
import {
  landsdSettlementSelectionAudit,
  landsdSettlementSelectionRule,
} from './settlementSelection'
import { prepareLandsdSettlementFeatureCollection } from './landsdPlaceName'

test('selection audit accounts for every class without mutating publisher records', () => {
  const properties = [
    { PLACE_CLASS: 'Settlement', GEO_NAME_ID: '1' },
    { PLACE_CLASS: 'Hydrographic' },
    { PLACE_CLASS: 'Topographic' },
    { PLACE_CLASS: 'settlement' },
    { PLACE_CLASS: '' },
    {},
  ]
  const before = structuredClone(properties)
  const audit = landsdSettlementSelectionAudit(properties)
  expect(audit.inputs).toEqual({ 'native-place-name-records': 6 })
  expect(audit.outputs).toEqual({
    'selected-settlements': 1,
    'excluded-from-divisions': 5,
  })
  expect(audit.decisions).toEqual({
    selected: 1,
    Hydrographic: 1,
    Topographic: 1,
    'missing-class': 2,
    'unexpected-class': 1,
  })
  const selected = prepareLandsdSettlementFeatureCollection({
    type: 'FeatureCollection',
    features: properties.map(p => ({
      type: 'Feature',
      properties: p,
      geometry: { type: 'Point', coordinates: [114, 22] },
    })),
  })
  expect(selected.features).toHaveLength(audit.outputs['selected-settlements'])
  expect(properties).toEqual(before)
  expect(Object.isFrozen(landsdSettlementSelectionRule.declaration.parameters)).toBe(
    true,
  )
})

test('empty source counts remain zero', () => {
  const audit = landsdSettlementSelectionAudit([])
  expect(audit.recordsAffected).toBe(0)
  expect(Object.values(audit.decisions).every(count => count === 0)).toBe(true)
})
