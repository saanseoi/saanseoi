import { expect, test } from 'bun:test'
import { validatePlanningHierarchy } from './planningHierarchy'

const make = (level: string, codes: Record<string, string>) => ({
  id: level,
  class: `planning-${level}`,
  identifiers: { 'hkgov-pland': codes },
})
const ppu = make('ppu', { ppu: '1' })
const spu = make('spu', { ppu: '1', spu: '11' })
const tpu = make('tpu', { ppu: '1', spu: '11', tpu: '111' })
const subunit = make('subunit', { ppu: '1', spu: '11', tpu: '111', subunit: '1' })

test('accepts the complete Planning chain at every level', () => {
  for (const [i, child] of [ppu, spu, tpu, subunit].entries())
    expect(() =>
      validatePlanningHierarchy(child, [ppu, spu, tpu].slice(0, i)),
    ).not.toThrow()
})

test('rejects cached immediate-parent-only and reordered paths', () => {
  expect(() => validatePlanningHierarchy(subunit, [tpu])).toThrow(
    'prepare the release again',
  )
  expect(() => validatePlanningHierarchy(tpu, [spu])).toThrow(
    'prepare the release again',
  )
  expect(() => validatePlanningHierarchy(subunit, [spu, ppu, tpu])).toThrow(
    'Incomplete',
  )
})

test('rejects an ancestor from another Planning branch', () => {
  expect(() =>
    validatePlanningHierarchy(subunit, [make('ppu', { ppu: '2' }), spu, tpu]),
  ).toThrow('Conflicting')
})
