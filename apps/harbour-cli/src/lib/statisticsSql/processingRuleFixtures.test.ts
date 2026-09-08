import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { ruleDeclarationFromFixture } from '@repo/core/provenance'
import { syntheticAreaExclusion } from '../divisionSql/processLocalDivisionGeometrySqlUploadSyntheticGeometry'

const root = new URL('../../../../../', import.meta.url)
const fixtures = new URL('fixtures/meta/processing-rules/', root)
const names = readdirSync(fixtures)
  .filter(name => name.endsWith('.json'))
  .sort()

test('every processing rule fixture is the exact frozen definition consumed by its registered executor', async () => {
  const ids = new Set<string>()
  expect(names.length).toBe(12)
  for (const name of names) {
    const fixture = ruleDeclarationFromFixture(
      await Bun.file(new URL(name, fixtures)).json(),
    )
    expect(ids.has(fixture.id)).toBe(false)
    ids.add(fixture.id)
    const module = await import(new URL(fixture.implementation.path, root).href)
    const rule = module[fixture.implementation.symbol]
    expect(typeof rule.execute).toBe('function')
    expect(rule.declaration).toEqual(fixture)
    expect(Object.isFrozen(rule.declaration)).toBe(true)
    expect(Object.isFrozen(rule.declaration.parameters)).toBe(true)
  }
})

test('synthetic geometry consumes and validates the declared exclusion polygon', async () => {
  const fixture = await Bun.file(
    new URL('synthetic-hong-kong-area.json', fixtures),
  ).json()
  expect(syntheticAreaExclusion(fixture.parameters.exclusion)).toEqual(
    fixture.parameters.exclusion,
  )
  const changed = structuredClone(fixture.parameters.exclusion)
  changed.coordinates[0][1][0] = 113.97
  expect(syntheticAreaExclusion(changed)).toEqual(changed)
  changed.coordinates[0][1][0] = Number.NaN
  expect(() => syntheticAreaExclusion(changed)).toThrow('finite WGS84')
  expect(() => syntheticAreaExclusion({ type: 'Point', coordinates: [] })).toThrow(
    'Polygon',
  )
})
