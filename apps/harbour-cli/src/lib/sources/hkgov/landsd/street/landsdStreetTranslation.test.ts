import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  translateAzureTexts,
  translateLandsdStreetNames,
} from './landsdStreetTranslation.ts'

test('translates missing schema labels through Azure with the requested locales', async () => {
  const translated = await translateAzureTexts(['Population Density'], {
    apiKey: 'test-key',
    from: 'en',
    to: 'zh-Hant',
    fetch: async (input, init) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('from')).toBe('en')
      expect(url.searchParams.get('to')).toBe('zh-Hant')
      expect(JSON.parse(String(init?.body))).toEqual([{ text: 'Population Density' }])
      return Response.json([{ translations: [{ text: '人口密度' }] }])
    },
  })

  expect(translated.get('Population Density')).toBe('人口密度')
})

test('translates unique names in Azure batches and reuses their source-hash cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-translation-'))
  const cachePath = join(root, 'translations.json')
  let requestCount = 0
  const fetch = async (_input: string | URL, init?: RequestInit) => {
    requestCount += 1
    expect(JSON.parse(String(init?.body))).toEqual([{ text: '中環灣仔繞道' }])
    return Response.json([{ translations: [{ text: '中环湾仔绕道' }] }])
  }

  try {
    const first = await translateLandsdStreetNames(['中環灣仔繞道', '中環灣仔繞道'], {
      apiKey: 'test-key',
      cachePath,
      fetch,
      now: () => new Date('2026-07-26T00:00:00.000Z'),
    })
    const second = await translateLandsdStreetNames(['中環灣仔繞道'], {
      apiKey: 'test-key',
      cachePath,
      fetch,
    })

    expect(requestCount).toBe(1)
    expect(first.get('中環灣仔繞道')).toMatchObject({
      name: '中环湾仔绕道',
      provenance: {
        machine: 'azure-translator-v3',
        sourceLocale: 'zh-Hant',
        targetLocale: 'zh-Hans',
      },
    })
    expect(second.get('中環灣仔繞道')?.name).toBe('中环湾仔绕道')
    expect(JSON.parse(await readFile(cachePath, 'utf8'))).toHaveProperty(
      first.get('中環灣仔繞道')?.provenance.sourceTextHash ?? '',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not replace failed Azure translation with Traditional Chinese', async () => {
  await expect(
    translateLandsdStreetNames(['中環灣仔繞道'], {
      apiKey: 'test-key',
      cachePath: join(tmpdir(), `saanseoi-landsd-failed-${crypto.randomUUID()}.json`),
      fetch: async () => new Response('unavailable', { status: 503 }),
    }),
  ).rejects.toThrow('Azure Translator failed')
})
