import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import {
  applyPlaceTranslationApplications,
  PLACE_MACHINE_TRANSLATION_ENABLED,
  resolvePlaceTranslationsBatch,
} from './placeTranslations.ts'

test('does not translate Place names or freeform addresses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-place-i18n-'))
  const fixturePath = join(root, 'fixture.json')
  try {
    const place = normaliseOverturePlace(
      {
        id: 'place-1',
        geometry: { type: 'Point', coordinates: [114.1, 22.3] },
        names: { en: 'Example Place' },
        addresses: [{ freeform: '3 On Kwan St' }],
      },
      '2026-08-19.0',
    )
    if (!place) throw new Error('Expected a place.')
    place.i18n.push({
      locale: 'zh-hant',
      name: null,
      nameAlts: null,
      nameVariant: null,
      brandName: null,
      brandNameAlts: null,
      brandNameVariant: null,
      freeformAddress: null,
      provenance: {
        isMachineTranslated: [],
        isHumanVerified: [],
        isLocaleInferred: false,
      },
    })
    let translationCalls = 0

    const result = await resolvePlaceTranslationsBatch({
      allowGeneration: true,
      fixturePath,
      records: [{ recordId: place.id, localisations: place.i18n }],
      sourceRelease: 'dr-hk-overture-place-2026-08-19.0',
      translate: async () => {
        translationCalls += 1
        return new Map()
      },
    })
    applyPlaceTranslationApplications(
      [{ recordId: place.id, localisations: place.i18n }],
      result,
    )

    expect(PLACE_MACHINE_TRANSLATION_ENABLED).toBe(false)
    expect(result.get(place.id)?.applications).toEqual([])
    expect(translationCalls).toBe(0)
    expect(place.i18n[1]).toMatchObject({
      locale: 'zh-hant',
      name: null,
      freeformAddress: null,
    })
    expect(access(fixturePath)).rejects.toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
