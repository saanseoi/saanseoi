import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { resolveRuleFixtureCatalog } from '@repo/core/provenance'
import { syntheticAreaExclusion } from '../divisionSql/processLocalDivisionGeometrySqlUploadSyntheticGeometry'

const root = new URL('../../../../../', import.meta.url)
const fixtures = new URL('fixtures/meta/processing-rules/', root)
const names = readdirSync(fixtures)
  .filter(name => name.endsWith('.json'))
  .sort()

test('every authored processing rule field is retained by its registered executor', async () => {
  const ids = new Set<string>()
  expect(names.length).toBeGreaterThanOrEqual(16)
  const catalogue = resolveRuleFixtureCatalog(
    Object.fromEntries(
      await Promise.all(
        names.map(async name => [
          name.slice(0, -5),
          await Bun.file(new URL(name, fixtures)).json(),
        ]),
      ),
    ),
  )
  for (const name of names) {
    const fixture = catalogue.get(name.slice(0, -5))!
    expect(ids.has(fixture.id)).toBe(false)
    ids.add(fixture.id)
    const module = await import(new URL(fixture.implementation.path, root).href)
    const rule = module[fixture.implementation.symbol]
    expect(typeof rule.execute).toBe('function')
    // Executors may add derived branch descriptions; authored values must match.
    expect(rule.declaration).toMatchObject(fixture)
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
