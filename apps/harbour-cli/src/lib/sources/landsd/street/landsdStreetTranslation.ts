import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const AZURE_TRANSLATION_MACHINE = 'azure-translator-v3'
export const AZURE_TRANSLATION_REGION = 'eastasia'

export type AzureTranslationLocale = 'en' | 'yue' | 'zh-Hans' | 'zh-Hant'

export type LandsdStreetTranslationProvenance = {
  machine: typeof AZURE_TRANSLATION_MACHINE
  sourceLocale: 'zh-Hant'
  sourceTextHash: string
  targetLocale: 'zh-Hans'
  translatedAt: string
}

export type LandsdStreetTranslatedName = {
  name: string
  provenance: LandsdStreetTranslationProvenance
}

type TranslationFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

type TranslationCache = Record<string, { name: string; translatedAt: string }>

/** Translate a small set of distinct schema labels when no publisher locale exists. */
export async function translateAzureTexts(
  texts: Iterable<string>,
  options: {
    apiKey?: string
    fetch?: TranslationFetch
    from: AzureTranslationLocale
    region?: string
    to: AzureTranslationLocale
  },
) {
  const apiKey = options.apiKey ?? process.env.AZURE_TRANSLATION_KEY
  if (!apiKey) {
    throw new Error('AZURE_TRANSLATION_KEY is required for missing publisher locales.')
  }
  const uniqueTexts = [...new Set([...texts].map(text => text.trim()).filter(Boolean))]
  const translated = new Map<string, string>()
  for (const batch of chunk(uniqueTexts, 50)) {
    const values = await translateAzureBatch(batch, apiKey, {
      fetch: options.fetch ?? globalThis.fetch,
      from: options.from,
      region: options.region ?? AZURE_TRANSLATION_REGION,
      to: options.to,
    })
    if (values.length !== batch.length || values.some(value => !value?.trim())) {
      throw new Error('Azure Translator returned an incomplete schema-label batch.')
    }
    for (const [index, source] of batch.entries()) {
      const value = values[index]
      if (!value) throw new Error('Azure Translator returned an empty schema label.')
      translated.set(source, value.trim())
    }
  }
  return translated
}

/**
 * Translate distinct Traditional Chinese street names once and cache successful
 * results by source-text SHA-256. There is intentionally no Traditional-to-
 * Simplified fallback: an Azure failure aborts the release.
 */
export async function translateLandsdStreetNames(
  names: Iterable<string>,
  options: {
    apiKey?: string
    cachePath: string
    fetch?: TranslationFetch
    now?: () => Date
    region?: string
  },
): Promise<Map<string, LandsdStreetTranslatedName>> {
  const apiKey = options.apiKey ?? process.env.AZURE_TRANSLATION_KEY
  if (!apiKey) {
    throw new Error(
      'AZURE_TRANSLATION_KEY is required to publish LandsD Simplified Chinese names.',
    )
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch
  const now = options.now ?? (() => new Date())
  const cachePath = resolve(options.cachePath)
  const cache = await readTranslationCache(cachePath)
  const uniqueNames = [...new Set([...names].map(name => name.trim()).filter(Boolean))]
  const untranslated = uniqueNames.filter(name => !cache[hashText(name)])
  const translatedAt = now().toISOString()

  for (const batch of chunk(untranslated, 50)) {
    const translated = await translateAzureBatch(batch, apiKey, {
      fetch: fetchImplementation,
      from: 'yue',
      region: options.region ?? AZURE_TRANSLATION_REGION,
      to: 'zh-Hans',
    })
    if (translated.length !== batch.length) {
      throw new Error('Azure Translator returned an incomplete LandsD name batch.')
    }
    for (const [index, source] of batch.entries()) {
      const translatedName = translated[index]?.trim()
      if (!translatedName) {
        throw new Error('Azure Translator returned an empty LandsD street name.')
      }
      cache[hashText(source)] = { name: translatedName, translatedAt }
    }
  }

  // Only persist after every batch has completed. A retry therefore either
  // reuses complete prior translations or translates a missing name afresh.
  if (untranslated.length > 0) {
    await writeTranslationCache(cachePath, cache)
  }

  return new Map(
    uniqueNames.map(name => {
      const sourceTextHash = hashText(name)
      const entry = cache[sourceTextHash]
      if (!entry) {
        throw new Error('Translation cache was missing a completed LandsD name.')
      }
      return [
        name,
        {
          name: entry.name,
          provenance: {
            machine: AZURE_TRANSLATION_MACHINE,
            sourceLocale: 'zh-Hant',
            sourceTextHash,
            targetLocale: 'zh-Hans',
            translatedAt: entry.translatedAt,
          },
        },
      ] as const
    }),
  )
}

async function translateAzureBatch(
  names: string[],
  apiKey: string,
  options: {
    fetch: TranslationFetch
    from: AzureTranslationLocale
    region: string
    to: AzureTranslationLocale
  },
) {
  const endpoint = new URL('https://api.cognitive.microsofttranslator.com/translate')
  endpoint.search = new URLSearchParams({
    'api-version': '3.0',
    from: options.from,
    to: options.to,
  }).toString()
  const response = await options.fetch(endpoint.toString(), {
    body: JSON.stringify(names.map(text => ({ text }))),
    headers: {
      'content-type': 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
      'Ocp-Apim-Subscription-Region': options.region,
      'X-ClientTraceId': crypto.randomUUID(),
    },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Azure Translator failed with HTTP ${response.status}.`)
  }
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error('Azure Translator returned an invalid response body.')
  }
  return payload.map(item => {
    if (!item || typeof item !== 'object') return undefined
    const translations = (item as { translations?: unknown }).translations
    if (!Array.isArray(translations) || translations.length === 0) return undefined
    const first = translations[0]
    return first &&
      typeof first === 'object' &&
      typeof (first as { text?: unknown }).text === 'string'
      ? (first as { text: string }).text
      : undefined
  })
}

async function readTranslationCache(path: string): Promise<TranslationCache> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        if (
          !/^[a-f0-9]{64}$/.test(key) ||
          !value ||
          typeof value !== 'object' ||
          typeof (value as { name?: unknown }).name !== 'string' ||
          typeof (value as { translatedAt?: unknown }).translatedAt !== 'string'
        ) {
          return []
        }
        return [[key, value as TranslationCache[string]]]
      }),
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
    throw error
  }
}

async function writeTranslationCache(path: string, cache: TranslationCache) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

function hashText(value: string) {
  return createHash('sha256').update(value.normalize('NFKC')).digest('hex')
}

function chunk<T>(values: T[], size: number) {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}
