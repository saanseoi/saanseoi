import { expect, test } from 'bun:test'
import {
  formatEditedAddress,
  localiseEditedAddress,
  parsedAddressSeed,
  validateBuildingNumber,
} from './placeAddressEditor.ts'
import { formatAddressCandidate, formatReviewNote } from './placeAddressCurationUi.ts'
import { createPlaceAddressMatcher, parsePlaceAddress } from './placeAddressMatcher.ts'
import {
  addressFingerprint,
  createSupplementaryAddressAnalyser,
  emptySupplementaryEntryLedger,
  parsedAddressFingerprint,
  parseSupplementaryCuration,
  supplementaryIdentity,
} from './supplementaryPlaceAddress.ts'
import { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import policy from './testFixtures/supplementaryAddressPolicy.json'

const english = {
  ...parsedAddressSeed(),
  addressId: 'als-example',
  locale: 'en',
  buildingName: 'Example House',
  streetName: 'Example Road',
  buildingNumberFrom: '20',
  buildingNumberExpression: '20',
  formattedAddress: 'Example House, 20 Example Road, NT',
}
const chinese = {
  ...english,
  locale: 'zh-hant',
  buildingName: '示例大廈',
  streetName: '示例路',
}
const matcher = createPlaceAddressMatcher([english, chinese])
const parse = (text: string) => parsePlaceAddress(text, matcher)

test('English edits preserve unchanged Chinese names, translate vocabulary and mark generated values unverified', () => {
  const edited = {
    ...english,
    buildingNumberTo: '24',
    buildingNumberExpression: '20–24',
    blockExpression: 'Tower A',
    phaseExpression: 'Phase 2',
  }
  const values = localiseEditedAddress(
    { ...edited, formattedAddress: formatEditedAddress(edited) },
    english,
    chinese,
  )
  expect(values[1]).toMatchObject({
    buildingName: '示例大廈',
    streetName: '示例路',
    buildingNumberTo: '24',
    blockExpression: 'A座',
    phaseExpression: '第2期',
  })
  expect(values[1]?.formattedAddress).toContain('示例路20–24號')
  expect(values[1]?.provenance?.isHumanVerified).toEqual([])
  expect(values[1]?.provenance?.isMachineTranslated).toContain('buildingNumberTo')
  expect(
    localiseEditedAddress(
      { ...edited, buildingName: 'New Proper Name' },
      english,
      chinese,
    )[1]?.buildingName,
  ).toBe('New Proper Name')
  expect(validateBuildingNumber('24A')).toBeUndefined()
  expect(validateBuildingNumber('24-26')).toBeDefined()
})

test('New Address decisions replay without an ALS base and retain localisation provenance in materialised sources', async () => {
  const source = {
    placeId: 'place-new',
    sourceRelease: '2026-09-01',
    texts: ['Example House, 20 Example Road'],
    lng: 0,
    lat: 0,
  }
  const seed = parsedAddressSeed(parse(source.texts[0] ?? ''))
  const values = localiseEditedAddress(
    { ...seed, formattedAddress: formatEditedAddress(seed) },
    seed,
  )
  const fixture = parseSupplementaryCuration(
    {
      ...structuredClone(policy),
      decisions: [
        {
          placeId: source.placeId,
          sourceRelease: source.sourceRelease,
          fingerprint: addressFingerprint(source.texts),
          previousAddressId: null,
          resolution: 'create_supplementary',
          addressId: supplementaryIdentity(values).addressId,
          reason: 'New Address',
          address: { baseAddressId: null, values },
        },
      ],
    },
    emptySupplementaryEntryLedger(),
  )
  const analyse = createSupplementaryAddressAnalyser(
    [english],
    new Set([english.addressId]),
    new Map(),
    fixture,
  )
  const first = analyse(source, null)
  expect(first.tier).toBe('supplementary')
  expect(first.entry?.baseAddressId).toBeNull()
  expect(analyse(source, null).addressId).toBe(first.addressId)
  const rows = await buildSupplementaryAddressRows({
    resolutions: [first],
    officialAddresses: new Map(),
    snapshotId: 's',
    divisionSnapshotId: 'd',
    sourceReleaseId: 'r',
    placeSourceReleaseId: 'p',
    sourceVersion: 'v',
    datasetId: 'ds',
  })
  expect(rows[0]?.current.districtId).toBeNull()
  expect(
    rows[0]?.canonical.sources[0]?.localisationProvenance['zh-hant']?.isHumanVerified,
  ).toEqual([])
  expect(rows[0]?.i18n[1]).not.toHaveProperty('provenance')
})

test('unlinked decisions survive unit changes but reopen a changed 2D address', () => {
  const texts = ['Shop 1, Example House, 20 Example Road']
  const fixture = parseSupplementaryCuration(
    {
      ...structuredClone(policy),
      decisions: [
        {
          placeId: 'p',
          sourceRelease: '2026-08-01',
          fingerprint: addressFingerprint(texts),
          address2dFingerprint: parsedAddressFingerprint(texts.map(parse)),
          previousAddressId: null,
          resolution: 'leave_unlinked',
          addressId: null,
          reason: 'Unlinked',
        },
      ],
    },
    emptySupplementaryEntryLedger(),
  )
  const analyse = createSupplementaryAddressAnalyser(
    [english],
    new Set([english.addressId]),
    new Map(),
    fixture,
  )
  const observation = { placeId: 'p', sourceRelease: '2026-09-01', lng: 0, lat: 0 }
  expect(
    analyse({ ...observation, texts: ['Shop 2, Example House, 20 Example Road'] }, null)
      .reason,
  ).toBe('explicit_retirement')
  expect(
    analyse({ ...observation, texts: ['Shop 2, Example House, 24 Example Road'] }, null)
      .reason,
  ).toBe('unlinked_address_changed')
})

test('review note omits missing components and previous links; candidate keeps exact formatted address and compact evidence', () => {
  const candidate = {
    addressId: english.addressId,
    score: 120,
    distanceMetres: 12.4,
    contradictions: [],
    breakdown: {},
    locale: 'en',
  }
  const note = formatReviewNote({
    placeId: 'p',
    fingerprint: '',
    tier: 'review',
    addressId: null,
    previous: null,
    reason: 'multiple_close_matches',
    sourceTexts: ['Shop 1, Example House, 20 Example Road'],
    parsed: [parse('Shop 1, Example House, 20 Example Road')],
    candidates: [candidate],
  })
  expect(note).toContain('Several candidates have similar scores')
  expect(note).toContain('- BuildingNumberStart : 20')
  expect(note).not.toContain('Previous')
  expect(note).not.toContain('BuildingNumberEnd')
  expect(formatAddressCandidate(english, candidate, false)).toBe(
    `${english.formattedAddress} (120 @ 12 m)`,
  )
  expect(
    formatAddressCandidate(
      english,
      { ...candidate, contradictions: ['number'] },
      false,
    ),
  ).toEndWith('(120 @ 12 m !number)')
})
