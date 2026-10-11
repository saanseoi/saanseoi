import { expect, test } from 'bun:test'
import {
  mappingSelectorDomain,
  schemaSelectorDomain,
  resolveSelectorDomain,
  expandSelector,
} from './fieldLineageSelectors'
import { computeVersionHash } from './versioning'
import type { ReleaseBinding } from './fieldLineageTypes'

const document = {
  fields: [{ sourceField: 'MYPOPN_LAND', fieldName: 'populationMidYear' }],
}
const hash = computeVersionHash(document)
const domain = mappingSelectorDomain({
  document,
  definitionHash: hash,
  scopeId: 'statistics',
  role: 'values',
  entriesPointer: '/fields',
  outputKey: 'fieldName',
  inputKey: 'sourceField',
  inputPrefix: ['properties'],
})
const binding: ReleaseBinding = {
  apiReleaseSetId: 'release',
  apiVersionReleaseSetId: 'version-release',
  definitionId: 'lineage',
  scopes: [
    {
      scopeId: 'statistics',
      definitionHashes: [hash],
      selectorDomains: [{ role: 'values', definitionHash: domain.id }],
    },
  ],
}
const retained = new Map<string, unknown>([
  [hash, document],
  [domain.id, domain.definition],
])

test('mapping expansion uses the selected immutable document and preserves publisher keys', () => {
  retained.set(computeVersionHash({ fields: [] }), { fields: [] })
  expect(
    expandSelector(
      ['attributes', 'values'],
      [],
      resolveSelectorDomain(binding, 'statistics', 'values', retained),
    ),
  ).toEqual([
    {
      outputPath: ['attributes', 'values', 'populationMidYear'],
      inputPath: ['properties', 'MYPOPN_LAND'],
      evidencePointer: '/fields/0',
    },
  ])
})

test('missing pins, missing documents and tampered documents fail closed', () => {
  expect(() => resolveSelectorDomain(binding, 'statistics', 'other', retained)).toThrow(
    'Expected one',
  )
  expect(() =>
    resolveSelectorDomain(
      binding,
      'statistics',
      'values',
      new Map([[domain.id, domain.definition]]),
    ),
  ).toThrow('Missing or corrupt')
  expect(() =>
    mappingSelectorDomain({
      document: { fields: [] },
      definitionHash: hash,
      scopeId: 'statistics',
      role: 'values',
      entriesPointer: '/fields',
      outputKey: 'fieldName',
      inputKey: 'sourceField',
    }),
  ).toThrow('hash mismatch')
})

test('schema selectors preserve dots and JSON pointer escapes; open maps stay unresolved', () => {
  const document = {
    type: 'object',
    additionalProperties: false,
    properties: { 'a.b/c~': { type: 'string' } },
  }
  const result = schemaSelectorDomain({
    document,
    definitionHash: computeVersionHash(document),
    scopeId: 'source',
    role: 'properties',
    pointer: '',
  })
  expect(result.definition.members[0]).toEqual({
    key: 'a.b/c~',
    inputPath: ['a.b/c~'],
    evidencePointer: '/properties/a.b~1c~0',
  })
  const open = { ...document, additionalProperties: true }
  expect(() =>
    schemaSelectorDomain({
      document: open,
      definitionHash: computeVersionHash(open),
      scopeId: 'source',
      role: 'properties',
      pointer: '',
    }),
  ).toThrow('closed object')
})
