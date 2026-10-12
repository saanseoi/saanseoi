import reviewProgram from '../../../fixtures/meta/curations/hkgov-dpo-address-review-program.json'
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
    // Shared executors resolve their concrete editorial inputs through the program.
    if (implementation.includes('alsReviewOperations')) {
      const codes = new Set(
        [
          ...implementation.matchAll(/operation\.code\s*[!=]==\s*['"]([^'"]+)['"]/g),
        ].map(match => match[1]),
      )
      actual.push(
        'hkgov-dpo-address-review-program',
        ...reviewProgram.operations
          .filter(operation => codes.has(operation.code))
          .map(operation => operation.fixture),
      )
    }
    if (implementation.includes("from './hkgovAlsReviewPolicy'"))
      actual.push('hkgov-dpo-address-review-policy')
    expect([...new Set(actual)].sort()).toEqual(types)
  }
})
