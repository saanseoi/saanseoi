import { requireDefined } from '../../../requireDefined'
import { expect, test } from 'bun:test'
import { supplementalNeighbourhoods as supplemental } from './divisionFixtures'
import additions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-additions.json'
import modifications from '../../../../../../fixtures/meta/curations/saanseoi-division/division-names.json'
const inventory = {
  divisions: [
    ...additions.entries,
    ...modifications.entries
      .filter(
        row => !additions.entries.some(addition => addition.id === row.divisionId),
      )
      .map(row => ({
        id: row.divisionId,
        names: Object.fromEntries(
          Object.entries(row.names).map(([locale, change]) => [
            locale,
            (change as { name?: string }).name,
          ]),
        ),
      })),
  ],
}
import {
  divisionGersUpgradeCandidates,
  generatedDivisionId,
  requireDivisionIdentityReview,
} from './divisionIdentityReview'
import { prepareCuratedDivisionRow as normaliseDivisionRow } from './division'
import { readDivisionRowsWithFixtures } from './divisionFixtures'

test('local identities use stable fixture keys and have one curated record', () => {
  for (const row of supplemental) {
    expect(row.id).toBe(generatedDivisionId(requireDefined(row.fixture).code))
    expect(row.id).toStartWith('ss-')
    expect(inventory.divisions.filter(record => record.id === row.id)).toHaveLength(1)
  }
  expect(
    inventory.divisions.filter(row => row.names.en === 'Lei Cheng Uk'),
  ).toHaveLength(1)
})

test('curated classification patches override publisher taxonomy for GERS identities', () => {
  for (const subtype of ['region', 'microhood', 'locality']) {
    const raw = {
      id: '15062812-a4d2-4d4a-b589-2f50bc31943f',
      subtype,
      class: 'village',
      admin_level: 99,
    }
    const original = structuredClone(raw)
    expect(normaliseDivisionRow(raw).base).toMatchObject({
      id: raw.id,
      class: 'microhood',
      level: 6,
    })
    expect(raw).toEqual(original)
  }
})

test('Jordan is not a Kwun Chung alias in any canonical name field', () => {
  const names = {
    primary: '官涌 Kwun Chung',
    common: { en: 'Kwun Chung', 'zh-Hant': '官涌' },
    rules: [
      { language: 'en', variant: 'alternate', value: 'Jordan' },
      { language: 'zh', variant: 'alternate', value: '佐敦' },
      { variant: 'alternate', value: '佐敦 Jordan' },
    ],
  }
  const original = structuredClone(names)
  const result = normaliseDivisionRow({
    id: '1aae385b-4843-4ea9-b8b3-d3726764daf3',
    names,
  })
  expect(JSON.stringify(result.i18n)).not.toContain('Jordan')
  expect(JSON.stringify(result.i18n)).not.toContain('佐敦')
  expect(names).toEqual(original)
})

test('new primary/common matches require GERS review without merging alternate names', async () => {
  const local = supplemental.find(row => row.names.primary.includes('Prince Edward'))!
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    names: {
      primary: '太子 Prince Edward',
      common: { en: 'Prince Edward', zh: '太子' },
    },
  }
  expect(divisionGersUpgradeCandidates([row])).toMatchObject([
    { divisionId: local.id, gersId: row.id },
  ])
  expect(() => requireDivisionIdentityReview([row])).toThrow('possible GERS upgrades')
  await expect(
    (async () => {
      for await (const _ of readDivisionRowsWithFixtures(
        { rows: [row] },
        { source: 'overture', regionCode: 'hk', resourceType: 'division' },
        100,
      )) {
        /* read */
      }
    })(),
  ).resolves.toBeUndefined()
  expect(
    divisionGersUpgradeCandidates([
      {
        ...row,
        names: {
          primary: 'Different place',
          rules: [{ language: 'en', variant: 'alternate', value: 'Prince Edward' }],
        },
      },
    ]),
  ).toEqual([])
  expect(
    divisionGersUpgradeCandidates([
      {
        id: '45285648-a223-4780-af58-129b6f3b3540',
        names: { primary: '鶴咀村 Hok Tsui Village' },
      },
    ]),
  ).toEqual([])
  const lower = supplemental.find(row =>
    row.names.primary.includes('Hok Tsui Lower Village'),
  )!
  expect(lower.names.common.find(name => name.language === 'zh-Hant')?.value).toBe(
    '鶴咀下村',
  )
})

test('explicitly excluded publisher identities cannot become upgrade candidates', () => {
  expect(
    divisionGersUpgradeCandidates([
      {
        id: '1e0827ef-4f1a-40d0-bdf1-a0807da65da2',
        names: { common: { en: 'Ngau Chi Wan Village', zh: '牛池灣村' } },
      },
    ]),
  ).toEqual([])
})
