import { expect, test } from 'bun:test'

import type { LandsdStreetRecord } from './landsdStreetIngestTypes.ts'
import {
  createLandsdStreetBaselineRegistry,
  mergeLandsdStreetBaselineCandidates,
  sameLandsdStreetBaselineRegistry,
  validateLandsdStreetCurrentRelease,
} from './landsdStreetBaselineRegistry.ts'

const sha256 = 'a'.repeat(64)

function baselineRecord(
  overrides: Partial<LandsdStreetRecord> = {},
): LandsdStreetRecord {
  return {
    application: null,
    deferToNotices: false,
    districtCodes: ['c&w'],
    effectiveDate: null,
    evidenceAssets: [
      {
        assetId: 'asset-baseline',
        assetUrl: 'https://assets.example/baseline.pdf',
        byteLength: 123,
        contentHash: sha256,
        label: 'Gazetted Street Name',
        manifest: {
          assetId: 'manifest-baseline',
          assetUrl: 'https://assets.example/baseline.json',
          contentHash: 'b'.repeat(64),
          objectKey: 'manifests/baseline.json',
        },
        mediaType: 'application/pdf',
        objectKey: 'source/baseline.pdf',
        originalUrl: 'https://www.landsd.gov.hk/baseline.pdf',
        retrievedAt: '2026-07-26T00:00:00.000Z',
        role: 'sourcePdf',
      },
    ],
    gazetteDate: null,
    i18n: [
      { description: null, locale: 'en', name: 'QUEEN STREET' },
      { description: null, locale: 'zh-Hant', name: '皇后街' },
    ],
    noticeRef: null,
    noticeType: null,
    parserDiagnostics: null,
    previousNoticeRefs: [],
    rawExtractedText: null,
    recordKey: 'landsd-street:baseline:queen-street',
    sourceKind: 'baseline',
    streetId: '019f0000-0000-7000-8000-000000000001',
    ...overrides,
  }
}

test('persists an environment-independent baseline identity registry', () => {
  const registry = createLandsdStreetBaselineRegistry({
    baselineSha256: sha256,
    records: [baselineRecord()],
    sourceVersion: '2026-07-26.0',
  })
  const merged = mergeLandsdStreetBaselineCandidates(registry, [])

  expect(merged).toEqual(registry.records)
  expect(sameLandsdStreetBaselineRegistry(registry, registry)).toBeTrue()
  expect(() =>
    validateLandsdStreetCurrentRelease({
      records: [baselineRecord()],
      registry,
      sourceVersion: '2026-07-26.0',
    }),
  ).not.toThrow()
})

test('rejects a target-specific staged ID that conflicts with the registry', () => {
  const registry = createLandsdStreetBaselineRegistry({
    baselineSha256: sha256,
    records: [baselineRecord()],
    sourceVersion: '2026-07-26.0',
  })

  expect(() =>
    mergeLandsdStreetBaselineCandidates(registry, [
      { ...registry.records[0]!, streetId: 'different-street-id' },
    ]),
  ).toThrow('checked-in identity registry')
})

test('rejects notice content from the current-name publication', () => {
  const record = baselineRecord({ deferToNotices: true })
  const registry = createLandsdStreetBaselineRegistry({
    baselineSha256: sha256,
    records: [record],
    sourceVersion: '2026-07-26.0',
  })

  expect(() =>
    validateLandsdStreetCurrentRelease({
      records: [record],
      registry,
      sourceVersion: '2026-07-26.0',
    }),
  ).toThrow('not a baseline-only name')
})
