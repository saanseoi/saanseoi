import { requireDefined } from '../../../requireDefined'
import { expect, test } from 'bun:test'
import { buildDeterministicUuidV5 } from '@repo/db'
import { expandedPatch, compactExample } from './reviewGraph.fixtures'
import { compactHierarchyPatch, expandHierarchyPatch } from './compactHierarchyPatch'

const { patch, catalogue } = await compactHierarchyPatch(
  expandedPatch,
  compactExample.catalogue,
)

test('every stored decision and containment annotation survives a compact round trip', async () => {
  const expanded = expandHierarchyPatch(patch, catalogue)
  const result = await compactHierarchyPatch(expanded, catalogue)
  expect(result.patch).toEqual(patch)
  expect(result.catalogue).toEqual(catalogue)
  expect(expandHierarchyPatch(result.patch, result.catalogue)).toEqual(expanded)
  for (const [id, path] of Object.entries(result.catalogue.paths))
    expect(id).toBe(
      buildDeterministicUuidV5(
        '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7',
        `hierarchy:${JSON.stringify(path)}`,
      ),
    )
})

test('missing paths, unknown ancestors and evidence outside a path are rejected', () => {
  const broken = structuredClone(patch)
  const reference = broken.entries[0]!.hierarchies.administrative![0]!
  reference.path = 'missing'
  expect(() => expandHierarchyPatch(broken, catalogue)).toThrow(
    'Invalid hierarchy path',
  )
  reference.path = patch.entries[0]!.hierarchies.administrative![0]!.path
  reference.evidence = { missing: { full_containment: false } }
  expect(() => expandHierarchyPatch(broken, catalogue)).toThrow('Evidence outside')
  const missingNode = structuredClone(catalogue)
  const path = requireDefined(
    catalogue.paths[reference.path as keyof typeof catalogue.paths],
  )
  delete (missingNode.nodes as Record<string, unknown>)[requireDefined(path[0])]
  expect(() => expandHierarchyPatch(patch, missingNode)).toThrow(
    'Unknown hierarchy ancestor',
  )
})

test('compaction rejects conflicting shared labels without mutating the catalogue', async () => {
  const expanded = expandHierarchyPatch(patch, catalogue)
  expanded.entries[0]!.hierarchies.administrative![0]![0]!.name = 'Conflicting label'
  const before = structuredClone(catalogue)
  await expect(compactHierarchyPatch(expanded, catalogue)).rejects.toThrow(
    'Conflicting hierarchy node',
  )
  expect(catalogue).toEqual(before)
})
