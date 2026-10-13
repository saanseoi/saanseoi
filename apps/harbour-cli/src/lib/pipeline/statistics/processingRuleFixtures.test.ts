import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { basename } from 'node:path'
import { resolveRuleFixtureCatalog } from '@repo/core/provenance'
import { syntheticAreaExclusion } from '../divisions/processLocalDivisionGeometrySqlUploadSyntheticGeometry'

const root = new URL('../../../../../../', import.meta.url)
const fixtures = new URL('fixtures/meta/processing-rules/', root)
const names = readdirSync(fixtures, { recursive: true })
  .filter((name): name is string => typeof name === 'string' && name.endsWith('.json'))
  .sort()

test('every authored processing rule field is retained by its exported executor declaration', async () => {
  const ids = new Set<string>()
  expect(names.length).toBeGreaterThanOrEqual(15)
  const catalogue = resolveRuleFixtureCatalog(
    Object.fromEntries(
      await Promise.all(
        names.map(async name => [
          basename(name, '.json'),
          await Bun.file(new URL(name, fixtures)).json(),
        ]),
      ),
    ),
  )
  for (const name of names) {
    const fixture = catalogue.get(basename(name, '.json'))!
    expect(ids.has(fixture.id)).toBe(false)
    ids.add(fixture.id)
    const module = await import(new URL(fixture.implementation.path, root).href)
    const rule = module[fixture.implementation.symbol]
    if (typeof rule === 'function') {
      const declarations = Object.values(module).filter(
        value =>
          value &&
          typeof value === 'object' &&
          'id' in value &&
          value.id === fixture.id,
      )
      expect(declarations).toHaveLength(1)
      expect(declarations[0]).toMatchObject(fixture)
    } else {
      expect(typeof rule.execute).toBe('function')
      // Registered executors may add branches; authored values remain immutable.
      expect(rule.declaration).toMatchObject(fixture)
      expect(Object.isFrozen(rule.declaration)).toBe(true)
      expect(Object.isFrozen(rule.declaration.parameters)).toBe(true)
    }
  }
})

test('synthetic geometry consumes and validates the declared exclusion polygon', async () => {
  const fixture = await Bun.file(
    new URL('../patches/overture-hong-kong-area-geometry-restoration.json', fixtures),
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
