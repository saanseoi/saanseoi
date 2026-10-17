import { expect, test } from 'bun:test'
import { parseI18nMeta } from './i18nMeta'

test('locale inference, field origin and human verification remain independent', () => {
  const meta = {
    isLocaleInferred: true,
    fields: {
      name: { origin: 'provided' },
      description: {
        origin: 'ai-translated',
        isHumanVerified: true,
        translatorId: 'azure',
      },
    },
  }
  expect(parseI18nMeta(meta)).toEqual(meta)
})

test('unrecorded origin and verification remain absent', () => {
  expect(parseI18nMeta(null)).toBeNull()
  expect(
    parseI18nMeta({ isLocaleInferred: false, fields: { name: { origin: 'inferred' } } })
      ?.fields?.name,
  ).not.toHaveProperty('isHumanVerified')
})

test.each([
  [[]],
  false,
  { isLocaleInferred: 1 },
  { isLocaleInferred: false, fields: [] },
  { isLocaleInferred: false, fields: { name: { origin: 'unknown' } } },
  {
    fields: { name: { origin: 'provided', isHumanVerified: 'true' } },
  },
  {
    fields: { name: { origin: 'human-translated', translatorId: ' ' } },
  },
])('rejects malformed localisation metadata %#', value => {
  expect(() => parseI18nMeta(value)).toThrow()
})

test.each([
  undefined,
  null,
  {},
  { isLocaleInferred: false },
  { fields: {} },
  { isLocaleInferred: false, fields: {} },
])('empty metadata is NULL %#', value => {
  expect(parseI18nMeta(value)).toBeNull()
})
test('compaction preserves explicit provenance and verification', () => {
  expect(
    parseI18nMeta({
      isLocaleInferred: false,
      fields: { name: { origin: 'provided', isHumanVerified: false } },
    }),
  ).toEqual({ fields: { name: { origin: 'provided', isHumanVerified: false } } })
})
