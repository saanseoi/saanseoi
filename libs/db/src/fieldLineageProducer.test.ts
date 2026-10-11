import { expect, test } from 'bun:test'
import { resolveFieldLineageDependency } from './fieldLineageProducer'
import type { ReleaseBinding } from './fieldLineageTypes'
import {
  alsInventoryTransforms,
  alsPreparedProducer,
} from './fieldLineageAlsPreparation'
import instructionTypes from '../../../fixtures/meta/fieldLineage/als-instruction-types.json'
import { readFileSync } from 'node:fs'

test('companion resolution requires an exact selected owner and recorded role', async () => {
  const binding: ReleaseBinding = {
    apiReleaseSetId: 'release',
    apiVersionReleaseSetId: 'version',
    definitionId: 'definition',
    scopes: [
      {
        scopeId: 'dependency',
        dependency: {
          ownerScopeId: 'owner',
          ownerSnapshotIds: ['snapshot'],
          role: 'address',
        },
      },
    ],
  }
  let reads = 0
  const read = async (id: string) => {
    reads++
    expect(id).toBe('snapshot')
    return { address: 'exact-address' }
  }
  expect(
    await resolveFieldLineageDependency(binding, 'dependency', 'snapshot', read),
  ).toBe('exact-address')
  await expect(
    resolveFieldLineageDependency(binding, 'dependency', 'other-release', read),
  ).rejects.toThrow('outside')
  expect(reads).toBe(1)
  await expect(
    resolveFieldLineageDependency(binding, 'dependency', 'snapshot', async () => ({})),
  ).rejects.toThrow('Missing exact')
})

test('ALS inventory transform ordering and instruction sources match the executor', () => {
  const source = readFileSync(
    'apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAls.ts',
    'utf8',
  )
  let position = source.indexOf('const rows = uniqueSourceFeatures.map')
  for (const [index, [symbol, file, layer]] of alsInventoryTransforms.entries()) {
    const next = source.indexOf(`${symbol}(`, position)
    expect(next).toBeGreaterThan(position)
    position = next + symbol.length
    const spec = alsPreparedProducer(`alsInitialTransform${index}`)!
    expect(spec.implementation.symbol).toBe(symbol)
    expect(spec.layer).toBe(layer)
    expect(
      (instructionTypes as Record<string, string[]>)[file]?.length,
    ).toBeGreaterThan(0)
  }
  for (const [file, types] of Object.entries(instructionTypes)) {
    const implementation = readFileSync(
      `apps/harbour-cli/src/lib/sources/hkgov/dpo/${file}.ts`,
      'utf8',
    )
    const actual = [...implementation.matchAll(/from\s+['"]([^'"]+\.json)['"]/g)]
      .map(match => match[1]!)
      .filter(path => /\/(curations|patches)\//.test(path))
      .map(path =>
        path
          .split('/')
          .at(-1)!
          .replace(/\.json$/, ''),
      )
    expect([...new Set(actual)].sort()).toEqual(types)
  }
})
