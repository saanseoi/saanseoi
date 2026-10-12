import { expect, test } from 'bun:test'
import { computeVersionHash } from './versioning'
import type { ReleaseBinding, SelectorDomain } from './fieldLineageTypes'
import { expandSelector, resolveSelectorDomain } from './fieldLineageSelectors'

const evidence = {
  fields: [{ sourceField: 'MYPOPN_LAND', fieldName: 'populationMidYear' }],
}
const evidenceHash = computeVersionHash(evidence)
const domain: SelectorDomain = {
  kind: 'field-lineage-selector-domain',
  scopeId: 'statistics',
  role: 'values',
  evidence: [{ definitionHash: evidenceHash, pointer: '/fields' }],
  members: [
    {
      key: 'populationMidYear',
      inputPath: ['MYPOPN_LAND'],
      evidencePointer: '/fields/0',
    },
  ],
}
const hash = computeVersionHash(domain)
const binding: ReleaseBinding = {
  apiReleaseSetId: 'selected-release',
  definitionId: 'lineage',
  apiVersionReleaseSetId: 'version-release',
  scopes: [
    {
      scopeId: 'statistics',
      sourceReleaseId: 'source-release-v1',
      definitionHashes: [evidenceHash],
      selectorDomains: [{ role: 'values', definitionHash: hash }],
    },
  ],
}

test('historical release uses its retained mapping despite another dictionary being available', () => {
  const later = structuredClone(domain)
  later.members[0]!.key = 'laterName'
  const retained = new Map<string, unknown>([
    [evidenceHash, evidence],
    [hash, domain],
    [computeVersionHash(later), later],
  ])
  expect(
    expandSelector(
      ['attributes', 'values'],
      [],
      resolveSelectorDomain(binding, 'statistics', 'values', retained),
    ),
  ).toEqual([
    {
      outputPath: ['attributes', 'values', 'populationMidYear'],
      inputPath: ['MYPOPN_LAND'],
      evidencePointer: '/fields/0',
    },
  ])
})

test('missing, changed and unbound selector evidence blocks expansion', () => {
  expect(() =>
    resolveSelectorDomain(binding, 'statistics', 'values', new Map()),
  ).toThrow('Missing or corrupt')
  const changed = structuredClone(domain)
  changed.members[0]!.key = 'changed'
  expect(() =>
    resolveSelectorDomain(binding, 'statistics', 'values', new Map([[hash, changed]])),
  ).toThrow('corrupt')
  const unbound = structuredClone(binding)
  unbound.scopes[0]!.definitionHashes = []
  expect(() =>
    resolveSelectorDomain(unbound, 'statistics', 'values', new Map([[hash, domain]])),
  ).toThrow('not pinned')
})

test('duplicate mappings fail and dotted keys remain one path segment', () => {
  const duplicate = structuredClone(domain)
  duplicate.members.push(duplicate.members[0]!)
  const duplicateHash = computeVersionHash(duplicate)
  const duplicateBinding = structuredClone(binding)
  duplicateBinding.scopes[0]!.selectorDomains![0]!.definitionHash = duplicateHash
  expect(() =>
    resolveSelectorDomain(
      duplicateBinding,
      'statistics',
      'values',
      new Map<string, unknown>([
        [duplicateHash, duplicate],
        [evidenceHash, evidence],
      ]),
    ),
  ).toThrow('duplicate')
  expect(
    expandSelector(
      ['properties'],
      [],
      [{ key: 'zh.hk', inputPath: ['zh.hk'], evidencePointer: '/properties/zh.hk' }],
    )[0]!.outputPath,
  ).toEqual(['properties', 'zh.hk'])
})
