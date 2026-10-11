import { expect, test } from 'bun:test'
import { preparationCurationNames } from './curationNames'
test('retains native excluded names and gives source aliases the final canonical names', () => {
  const rows = preparationCurationNames({
    overture: [
      {
        id: 'excluded',
        names: { common: { en: 'Old source name', 'zh-Hant': '來源名稱' } },
      },
    ],
    landsd: [
      {
        id: '10',
        placeNames: [
          { nameStatus: 'Official', nameEn: 'Source island', nameZhHant: '小島' },
        ],
      },
    ],
    protomaps: [],
    definitions: {},
    names: [{ divisionId: 'canonical', locale: 'en', name: 'Canonical island' }],
    aliases: { 'LANDSD:PLACE_NAME:10': 'canonical' },
  })
  expect(rows.find(row => row.id === 'excluded')?.names).toEqual({
    en: 'Old source name',
    'zh-hant': '來源名稱',
  })
  expect(rows.find(row => row.id === 'LANDSD:PLACE_NAME:10')?.names).toEqual({
    en: 'Canonical island',
    'zh-hant': '小島',
  })
})
