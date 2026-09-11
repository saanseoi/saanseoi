import { expect, test } from 'bun:test'
import { retainSourceProperties } from './retainedProperties'

test('retained fields use camelCase without changing literals or language dictionary keys', () => {
  const original = {
    OBJECTID: 3,
    CSDI_ADMIN_AREA_ID: '001',
    END_LIFESPAN: null,
    SHAPE_Length: 21739.940418289458,
    names: { common: { 'zh-Hant': ' 中文 ' } },
    sources: [{ record_id: '007', update_time: '2026-09-11' }],
  }
  const before = structuredClone(original)
  const result = retainSourceProperties(original)
  expect(result).toEqual({
    objectId: 3,
    csdiAdminAreaId: '001',
    endLifespan: null,
    shapeLength: 21739.940418289458,
    names: { common: { 'zh-Hant': ' 中文 ' } },
    sources: [{ recordId: '007', updateTime: '2026-09-11' }],
  })
  expect(original).toEqual(before)
  expect(retainSourceProperties(result)).toEqual(result)
})

test('ambiguous retained names fail instead of discarding a publisher value', () => {
  expect(() => retainSourceProperties({ FOO_BAR: 1, fooBar: 2 })).toThrow('collision')
  expect(() =>
    retainSourceProperties({ nested: [{ OBJECTID: 1, objectId: 2 }] }),
  ).toThrow('collision')
})

test('locale labels use suffixes without renaming demographic language measures', () => {
  expect(
    retainSourceProperties({
      enBuildingName: 'Building',
      zhHantBuildingName: '樓',
      zhHansBuildingName: '楼',
      DC_ENG: 'District',
      DC_CHI: '區',
      NewTown_en: 'Town',
      NAME_TC: '名',
      NAME_SC: '名',
      BORN_CHI: 12,
      UL_ENG: 34,
      READCHI_ABLEPCTN: 56,
      names: { common: { en: 'Name', 'zh-hk': '港', 'zh-hant': '繁' } },
    }),
  ).toEqual({
    buildingNameEn: 'Building',
    buildingNameZhHant: '樓',
    buildingNameZhHans: '楼',
    dcEn: 'District',
    dcZhHant: '區',
    newTownEn: 'Town',
    nameZhHant: '名',
    nameZhHans: '名',
    bornChi: 12,
    ulEng: 34,
    readchiAblepctn: 56,
    names: { common: { en: 'Name', 'zh-hk': '港', 'zh-hant': '繁' } },
  })
  expect(() => retainSourceProperties({ DC_ENG: 'A', dcEn: 'B' })).toThrow('collision')
})
