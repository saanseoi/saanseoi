import { expect, test } from 'bun:test'
import { ruleDeclarationFromFixture, resolveRuleFixtureCatalog } from './ruleFixture'
import { auditActionCategory, type IndividualAudit } from './auditTypes'
import area from '../../../../fixtures/meta/processing-rules/division-area-geometry.json'
import boundary from '../../../../fixtures/meta/processing-rules/division-boundary-geometry.json'
import exclusions from '../../../../fixtures/meta/processing-rules/division-geometry-exclusions.json'
import { createGeometryExclusionRule } from '../pipeline/services/divisions/divisionGeometry'

test('area and boundary retain one resolved exclusion policy', () => {
  const resolved = resolveRuleFixtureCatalog({ area, boundary, exclusions })
  expect(resolved.get('area')?.dependencies).toEqual([resolved.get('exclusions')!])
  expect(resolved.get('boundary')?.dependencies).toEqual([resolved.get('exclusions')!])
  expect(() => resolveRuleFixtureCatalog({ area })).toThrow(
    'Unknown processing rule dependency',
  )
  expect(() =>
    resolveRuleFixtureCatalog({
      area: { ...area, dependencyIds: [boundary.id] },
      boundary: { ...boundary, dependencyIds: [area.id] },
    }),
  ).toThrow('Cyclic')
})

test('changing one exclusion policy changes both geometry selections', () => {
  const fixture = structuredClone(exclusions)
  fixture.parameters.excludedRegions = ['test-region']
  const rule = createGeometryExclusionRule(fixture)
  for (const kind of ['area', 'boundary'] as const) {
    expect(rule.execute({ kind, region: 'test-region' })).toBe(true)
    expect(rule.execute({ kind, region: 'CN-GD' })).toBe(false)
  }
  const divisionId = fixture.parameters.excludedAreaDivisionIds[0]!
  expect(rule.execute({ kind: 'area', divisionId })).toBe(true)
  expect(rule.execute({ kind: 'boundary', divisionId })).toBe(false)
  fixture.parameters.excludedRegions.push('CN-GD')
  expect(rule.execute({ kind: 'area', region: 'CN-GD' })).toBe(false)
})

test('curation guards and independent QA patch origins are distinct', () => {
  const base = { ...exclusions, basis: 'fixture' }
  expect(() =>
    ruleDeclarationFromFixture({ ...base, review: { kind: 'curation' } }),
  ).toThrow('related guard')
  expect(() =>
    ruleDeclarationFromFixture({ ...base, review: { kind: 'patch', guard: {} } }),
  ).toThrow('triggering guard')
  expect(
    ruleDeclarationFromFixture({ ...base, review: { kind: 'patch' } }).review,
  ).toEqual({ kind: 'patch' })
  expect(
    ruleDeclarationFromFixture({
      ...base,
      review: {
        kind: 'curation',
        guard: {
          id: 'missing-identity',
          summary: 'Resolve an unmatched identity.',
          consequence: 'block-ingestion',
        },
      },
    }).review?.kind,
  ).toBe('curation')
  const action = {
    operation: 'unremarkable-name',
    basis: 'fixture',
    review: { kind: 'patch' },
  } as IndividualAudit
  expect(auditActionCategory(action)).toBe('patches')
  expect(
    auditActionCategory({
      ...action,
      review: undefined,
      operation: 'name-containing-patch',
    }),
  ).toBe('curations')
})
