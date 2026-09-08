import { expect, test } from 'bun:test'
import {
  createDivisionBranchCounts,
  divisionNormalisationRule,
  normaliseDivisionRow,
  buildCanonicalDivisionApiI18n,
} from './division'
import { inferLocale } from '../localeInference'
import { retainDivisionProvenance } from './divisionProvenance'
import {
  readValue,
  validateAuditManifest,
  type ProvenanceStore,
} from '../../provenance'

test('classification counts selected branches once and compares actual source values', () => {
  const counts = createDivisionBranchCounts()
  const row = normaliseDivisionRow(
    {
      id: 'one',
      subtype: 'subdistrict',
      class: 'city',
      level: 2,
      type: 'district',
      names: { primary: '香港' },
    },
    { branchCounts: counts },
  )
  expect(row.base.level).toBe(2)
  expect(row.base.type).toBe('district')
  expect(counts['level.contains.subtype.district']).toEqual({ matched: 1, changed: 0 })
  expect(counts['level.contains.subtype.subdistrict']).toEqual({
    matched: 0,
    changed: 0,
  })
  expect(counts['level.contains.class.city']).toEqual({ matched: 0, changed: 0 })
  expect(counts['type.fallback.level.2']).toEqual({ matched: 1, changed: 0 })
  expect(counts['inference.han']).toEqual({ matched: 1, changed: 1 })
  expect(
    Object.entries(counts)
      .filter(([id]) => id.startsWith('level.'))
      .reduce((n, [, c]) => n + c.matched, 0),
  ).toBe(1)
  normaliseDivisionRow(
    { id: 'two', subtype: 'locality', class: 'town', names: {} },
    { branchCounts: counts },
  )
  expect(counts['level.locality.town']).toEqual({ matched: 1, changed: 1 })
  expect(counts['type.locality.town']).toEqual({ matched: 1, changed: 1 })
})

test('inference retains the actual detectors and counts failed and mixed-script decisions', () => {
  const counts = createDivisionBranchCounts()
  expect(inferLocale(' 香港 Hong Kong ', counts)).toEqual([
    { locale: 'zh-hant', value: '香港' },
    { locale: 'en', value: 'Hong Kong' },
  ])
  expect(inferLocale('香港', counts)).toEqual([{ locale: 'zh-hant', value: '香港' }])
  expect(inferLocale('Hong Kong 123', counts)).toEqual([
    { locale: 'en', value: 'Hong Kong 123' },
  ])
  expect(inferLocale('Hong Kong 香港', counts)).toEqual([])
  expect(inferLocale('é', counts)).toEqual([])
  expect(counts['inference.split']).toEqual({ matched: 1, changed: 1 })
  expect(counts['inference.none']).toEqual({ matched: 2, changed: 0 })
  expect(divisionNormalisationRule.declaration.parameters.localeDetection.han).toEqual({
    source: '\\p{Script=Han}',
    flags: 'u',
  })
})

test('locale mapping distinguishes copied, preserved, absent and shadowed candidates', () => {
  const counts = createDivisionBranchCounts()
  const source = normaliseDivisionRow({
    id: 'one',
    names: { common: { en: 'Name', 'zh-hk': '香港', 'zh-tw': '臺灣' } },
  }).i18n
  const rows = buildCanonicalDivisionApiI18n(source, counts)
  expect(rows.find(row => row.locale === 'zh-hant')?.name).toBe('香港')
  expect(counts['locale.en.existing']).toEqual({ matched: 1, changed: 0 })
  expect(counts['locale.zh-hant.source.zh-hk']).toEqual({ matched: 1, changed: 1 })
  expect(counts['locale.zh-hant.source.zh-tw']).toEqual({ matched: 0, changed: 0 })
  expect(counts['locale.zh-hans.absent']).toEqual({ matched: 1, changed: 0 })
  buildCanonicalDivisionApiI18n(rows, counts)
  expect(counts['locale.zh-hant.existing']).toEqual({ matched: 1, changed: 0 })
})

test('bulk retention round-trips branch counts without individual record actions', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const value = objects.get(key)
      return value ? { arrayBuffer: async () => value } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
  const branchCounts = createDivisionBranchCounts()
  normaliseDivisionRow(
    { id: 'one', subtype: 'region', names: { primary: 'Name' } },
    { branchCounts },
  )
  const input = {
    releaseId: 'release',
    datasetCode: 'divisions',
    inputCount: 1,
    outputCount: 1,
    actions: [],
    branchCounts,
  }
  const retained = await retainDivisionProvenance(store, input)
  validateAuditManifest(retained.manifest)
  expect(retained.manifest.applicationCount).toBe(0)
  expect(retained.manifest.bulk[0]?.counts.branches).toEqual(branchCounts)
  const definition = await readValue(store, retained.manifest.bulk[0]!.definition)
  expect(definition).toMatchObject({
    branches: divisionNormalisationRule.declaration.branches,
  })
  const unrecorded = await retainDivisionProvenance(store, {
    ...input,
    branchCounts: undefined,
  })
  expect(unrecorded.manifest.bulk[0]?.counts.branches).toBeUndefined()
  const invalid = structuredClone(retained.manifest)
  invalid.bulk[0]!.counts.branches!['inference.han'] = { matched: 0, changed: 1 }
  expect(() => validateAuditManifest(invalid)).toThrow('Invalid branch counts')
  await expect(
    retainDivisionProvenance(store, {
      ...input,
      branchCounts: { unknown: { matched: 0, changed: 0 } },
    }),
  ).rejects.toThrow('matching retained branch definitions')
})
