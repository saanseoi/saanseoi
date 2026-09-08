import { expect, test } from 'bun:test'
import area from '../../../../../fixtures/meta/processing-rules/division-area-geometry.json'
import boundary from '../../../../../fixtures/meta/processing-rules/division-boundary-geometry.json'
import fields from '../../../../../fixtures/meta/processing-rules/statistic-field-curation.json'
import localisation from '../../../../../fixtures/meta/processing-rules/statistic-localisation.json'
import {
  divisionAreaGeometryRule,
  divisionBoundaryGeometryRule,
} from '@repo/core/pipeline/services/divisionGeometry'
import { statisticFieldCurationRule } from './statisticFieldCurationRule'
import { statisticLocalisationRule } from './statisticLocalisationRule'

test('geometry and statistic metadata executors expose their exact JSON fixture declarations', () => {
  for (const [rule, fixture] of [
    [divisionAreaGeometryRule, area],
    [divisionBoundaryGeometryRule, boundary],
    [statisticFieldCurationRule, fields],
    [statisticLocalisationRule, localisation],
  ] as const) {
    expect(fixture).toEqual(rule.declaration)
    expect(Object.isFrozen(rule.declaration)).toBe(true)
  }
})
