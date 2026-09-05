import { readFile, rm, mkdtemp, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import {
  applyPlaceTranslationApplications,
  resolvePlaceTranslationsBatch,
} from './placeTranslations.ts'

const base = (id: string, name = `Place ${id}`) => {
  const place = normaliseOverturePlace(
    {
      id,
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      names: { en: name },
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a place.')
  place.i18n.push({
    locale: 'zh-hant',
    name: null,
    nameAlts: null,
    nameVariant: null,
    isLocaleInferred: false,
    brandName: null,
    brandNameAlts: null,
    brandNameVariant: null,
    freeformAddress: null,
    provenance: {
      isMachineTranslated: [],
      isHumanVerified: [],
      isLocaleInferred: false,
      localeEvidence: [],
    },
  })
  return place
}

const hash = (value: string) =>
  createHash('sha256').update(value.normalize('NFKC')).digest('hex')

describe('Places translation fixtures', () => {
  test('translates only missing fields on an existing locale row and never brands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-place-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      const place = base('place-1')
      place.i18n[0]!.brandName = 'Source Brand'
      const result = await resolvePlaceTranslationsBatch({
        allowGeneration: true,
        datasetCode: 'ds-hk-overture-place',
        fixturePath,
        records: [{ recordId: place.id, localisations: place.i18n }],
        sourceRelease: 'dr-hk-overture-place-2026-08-19.0',
        translate: async (texts, { to }) =>
          new Map(
            [...texts].map(text => [text, to === 'zh-Hant' ? `中${text}` : text]),
          ),
      })
      expect(result.get(place.id)?.applications).toEqual([
        expect.objectContaining({
          field: 'name',
          locale: 'zh-hant',
          text: '中Place place-1',
        }),
      ])
      expect(
        result
          .get(place.id)
          ?.applications.some(app => (app.field as string) === 'brandName'),
      ).toBe(false)
      applyPlaceTranslationApplications(
        [{ recordId: place.id, localisations: place.i18n }],
        result,
      )
      expect(place.i18n[1]?.name).toBe('中Place place-1')
      expect(place.i18n[1]?.provenance.isMachineTranslated).toEqual(['name'])
      expect(place.i18n).toHaveLength(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('reuses fixtures and sends distinct text in batches of 50', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-place-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      const places = Array.from({ length: 51 }, (_, index) => base(`place-${index}`))
      const calls: string[][] = []
      const translate = async (texts: Iterable<string>) => {
        const batch = [...texts]
        calls.push(batch)
        return new Map(batch.map(text => [text, `中${text}`]))
      }
      await resolvePlaceTranslationsBatch({
        allowGeneration: true,
        fixturePath,
        records: places.map(place => ({
          recordId: place.id,
          localisations: place.i18n,
        })),
        sourceRelease: 'dr-hk-overture-place-2026-08-19.0',
        translate,
      })
      expect(calls.map(batch => batch.length)).toEqual([50, 1])
      const before = calls.length
      const second = await resolvePlaceTranslationsBatch({
        fixturePath,
        records: [{ recordId: places[0]!.id, localisations: places[0]!.i18n }],
        sourceRelease: 'dr-hk-overture-place-2026-08-19.0',
        translate: async () => {
          throw new Error('fixture should be reused')
        },
      })
      expect(second.get('place-0')?.applications[0]?.provenance).toBe('ai-translated')
      expect(calls.length).toBe(before)
      const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
        entries: unknown[]
      }
      expect(fixture.entries).toHaveLength(51)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('retains a human-verified fixture distinction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-place-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          datasetCode: 'ds-hk-overture-place',
          version: 1,
          entries: [
            {
              datasetCode: 'ds-hk-overture-place',
              recordId: 'place-1',
              field: 'name',
              sourceLocale: 'en',
              sourceText: 'Place place-1',
              sourceTextHash: hash('Place place-1'),
              targetLocale: 'zh-hant',
              text: '已審核',
              machine: 'azure-translator-v3',
              provider: 'azure',
              verificationStatus: 'human-verified',
              firstSeenRelease: 'dr-hk-overture-place-2026-08-19.0',
              lastSeenRelease: 'dr-hk-overture-place-2026-08-19.0',
            },
          ],
        }),
      )
      const result = await resolvePlaceTranslationsBatch({
        fixturePath,
        records: [
          {
            recordId: 'place-1',
            localisations: [
              { locale: 'en', name: 'Place place-1', freeformAddress: null },
              { locale: 'zh-hant', name: null, freeformAddress: null },
            ],
          },
        ],
        sourceRelease: 'dr-hk-overture-place-2026-08-19.0',
      })
      expect(result.get('place-1')?.applications[0]?.provenance).toBe(
        'human-translated',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('records human verification alongside machine provenance when applied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-place-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          datasetCode: 'ds-hk-overture-place',
          version: 1,
          entries: [
            {
              datasetCode: 'ds-hk-overture-place',
              recordId: 'place-1',
              field: 'name',
              sourceLocale: 'en',
              sourceText: 'Place place-1',
              sourceTextHash: hash('Place place-1'),
              targetLocale: 'zh-hant',
              text: '已審核',
              machine: 'azure-translator-v3',
              provider: 'azure',
              verificationStatus: 'human-verified',
              firstSeenRelease: '2026-08-19.0',
              lastSeenRelease: '2026-08-19.0',
            },
          ],
        }),
      )
      const place = base('place-1')
      const result = await resolvePlaceTranslationsBatch({
        fixturePath,
        records: [{ recordId: place.id, localisations: place.i18n }],
        sourceRelease: '2026-08-19.0',
      })
      applyPlaceTranslationApplications(
        [{ recordId: place.id, localisations: place.i18n }],
        result,
      )
      expect(place.i18n[1]?.provenance).toMatchObject({
        isMachineTranslated: ['name'],
        isHumanVerified: ['name'],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
