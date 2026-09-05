import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type {
  PlaceI18nRecord,
  PlaceI18nField,
} from '@repo/core/pipeline/services/place'
import {
  AZURE_TRANSLATION_MACHINE,
  AZURE_TRANSLATION_REGION,
  translateAzureTexts,
  type AzureTranslationLocale,
} from '../sources/landsd/street/landsdStreetTranslation.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const DEFAULT_FIXTURE_ROOT = resolve(REPO_ROOT, 'fixtures/i18n/datasets')
const LOCALES = ['en', 'zh-hant', 'zh-hans'] as const
const TRANSLATABLE_FIELDS = ['name', 'freeformAddress'] as const
export const PLACE_TRANSLATION_BATCH_SIZE = 50

type Locale = (typeof LOCALES)[number]
export type PlaceTranslationField = (typeof TRANSLATABLE_FIELDS)[number]
export type PlaceTranslationProvenance = 'ai-translated' | 'human-translated'

export type PlaceTranslationRecord = {
  recordId: string
  context?: Record<string, string | null>
  localisations: Array<Pick<PlaceI18nRecord, 'locale' | 'name' | 'freeformAddress'>>
}

export type PlaceTranslationApplication = {
  field: PlaceTranslationField
  locale: Locale
  text: string
  provenance: PlaceTranslationProvenance
  sourceLocale: Locale
  sourceText: string
  sourceTextHash: string
}

export type PlaceTranslationResult = {
  applications: PlaceTranslationApplication[]
}

type FixtureEntry = {
  context?: Record<string, string | null>
  contextHash?: string
  datasetCode: string
  recordId: string
  recordIds?: string[]
  field: PlaceTranslationField
  sourceLocale: Locale
  sourceText: string
  sourceTextHash: string
  targetLocale: Locale
  text: string
  machine: typeof AZURE_TRANSLATION_MACHINE
  provider: 'azure'
  verificationStatus: 'machine-unverified' | 'human-verified'
  firstSeenRelease: string
  lastSeenRelease: string
}

type Fixture = { datasetCode: string; entries: FixtureEntry[]; version: 1 }

/**
 * Resolves only missing fields on already-existing Place locale rows. It never
 * creates a locale row, and it writes a fixture only when generation is explicitly
 * enabled by a local import.
 */
export async function resolvePlaceTranslationsBatch(input: {
  allowGeneration?: boolean
  datasetCode?: string
  fixturePath?: string
  records: PlaceTranslationRecord[]
  sourceRelease: string
  translate?: (
    texts: Iterable<string>,
    options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
  ) => Promise<Map<string, string>>
}): Promise<Map<string, PlaceTranslationResult>> {
  const datasetCode = input.datasetCode ?? 'ds-hk-overture-place'
  const fixturePath = input.fixturePath ?? placeTranslationFixturePath(datasetCode)
  const fixture = await readFixture(fixturePath, datasetCode)
  const results = new Map<string, PlaceTranslationResult>()
  let fixtureChanged = false
  const unresolved = new Map<
    string,
    Array<{
      context?: Record<string, string | null>
      recordId: string
      field: PlaceTranslationField
      sourceLocale: Locale
      sourceText: string
      sourceTextHash: string
      targetLocale: Locale
    }>
  >()
  const generated: FixtureEntry[] = []

  for (const record of input.records) {
    const applications: PlaceTranslationApplication[] = []
    results.set(record.recordId, { applications })
    const rows = new Map(
      record.localisations.map(row => [normaliseLocale(row.locale), row] as const),
    )
    for (const targetLocale of LOCALES) {
      const target = rows.get(targetLocale)
      if (!target) continue
      for (const field of TRANSLATABLE_FIELDS) {
        if (valueFor(target, field)) continue
        const source = selectSource(rows, targetLocale, field)
        if (!source) continue
        const sourceTextHash = hashText(source.text)
        const contextHash = hashContext(record.context)
        const cached = fixture.entries.find(
          entry =>
            entry.field === field &&
            entryContextHash(entry) === contextHash &&
            entry.sourceLocale === source.locale &&
            entry.sourceTextHash === sourceTextHash &&
            entry.targetLocale === targetLocale,
        )
        if (cached) {
          applications.push(toApplication(cached, source.text))
          const before = `${cached.recordIds?.join(',') ?? ''}|${cached.firstSeenRelease}|${cached.lastSeenRelease}`
          touchEntry(cached, record.recordId, input.sourceRelease)
          const after = `${cached.recordIds?.join(',') ?? ''}|${cached.firstSeenRelease}|${cached.lastSeenRelease}`
          fixtureChanged ||= before !== after
          continue
        }
        if (!input.allowGeneration) {
          throw new Error(
            `Missing ${targetLocale} ${field} fixture for ${datasetCode}/${record.recordId}. Run the local Places fixture builder or enable fixture generation explicitly.`,
          )
        }
        const pairKey = `${field}\u0000${source.locale}\u0000${targetLocale}`
        const values = unresolved.get(pairKey) ?? []
        values.push({
          context: record.context,
          recordId: record.recordId,
          field,
          sourceLocale: source.locale,
          sourceText: source.text,
          sourceTextHash,
          targetLocale,
        })
        unresolved.set(pairKey, values)
      }
    }
  }

  for (const values of unresolved.values()) {
    const first = values[0]
    if (!first) continue
    const translated = await translateInBatches(
      [...new Set(values.map(value => value.sourceText))],
      {
        from: azureLocale(first.sourceLocale),
        to: azureLocale(first.targetLocale),
        translate: input.translate,
      },
    )
    for (const value of values) {
      const text = translated.get(value.sourceText)?.trim()
      if (!text) {
        throw new Error(
          `Missing ${value.targetLocale} ${value.field} translation for ${datasetCode}/${value.recordId}.`,
        )
      }
      const entry: FixtureEntry = {
        context: value.context,
        contextHash: hashContext(value.context),
        datasetCode,
        recordId: value.recordId,
        recordIds: [value.recordId],
        field: value.field,
        sourceLocale: value.sourceLocale,
        sourceText: value.sourceText,
        sourceTextHash: value.sourceTextHash,
        targetLocale: value.targetLocale,
        text,
        machine: AZURE_TRANSLATION_MACHINE,
        provider: 'azure',
        verificationStatus: 'machine-unverified',
        firstSeenRelease: input.sourceRelease,
        lastSeenRelease: input.sourceRelease,
      }
      generated.push(entry)
      results
        .get(value.recordId)
        ?.applications.push(toApplication(entry, value.sourceText))
    }
  }

  if (generated.length > 0 || fixtureChanged) {
    fixture.entries.push(...generated)
    fixture.entries = dedupeEntries(fixture.entries)
    fixture.entries.sort(compareEntries)
    await writeFixture(fixturePath, fixture)
  }
  return results
}

export function applyPlaceTranslationApplications(
  places: PlaceTranslationRecord[],
  results: Map<string, PlaceTranslationResult>,
) {
  for (const place of places) {
    const applications = results.get(place.recordId)?.applications ?? []
    for (const application of applications) {
      const row = place.localisations.find(
        localisation => normaliseLocale(localisation.locale) === application.locale,
      )
      if (!row) continue
      ;(row as Record<string, unknown>)[application.field] = application.text
      const provenance = (row as PlaceI18nRecord).provenance
      if (provenance) {
        const field: PlaceI18nField = application.field
        if (application.provenance === 'human-translated') {
          if (!provenance.isMachineTranslated.includes(field))
            provenance.isMachineTranslated.push(field)
          if (!provenance.isHumanVerified.includes(field))
            provenance.isHumanVerified.push(field)
        } else if (!provenance.isMachineTranslated.includes(field)) {
          provenance.isMachineTranslated.push(field)
        }
      }
    }
  }
}

export function placeTranslationFixturePath(datasetCode: string) {
  if (!/^ds-[a-z0-9-]+$/.test(datasetCode))
    throw new Error(`Invalid dataset code for Places i18n fixture: ${datasetCode}`)
  return resolve(DEFAULT_FIXTURE_ROOT, `${datasetCode}.json`)
}

function selectSource(
  rows: Map<Locale, PlaceTranslationRecord['localisations'][number]>,
  targetLocale: Locale,
  field: PlaceTranslationField,
) {
  const order: Record<Locale, Locale[]> = {
    en: ['zh-hant', 'zh-hans'],
    'zh-hant': ['en', 'zh-hans'],
    'zh-hans': ['en', 'zh-hant'],
  }
  for (const locale of order[targetLocale]) {
    const row = rows.get(locale)
    const text = row ? valueFor(row, field) : null
    if (text) return { locale, text }
  }
  return null
}

function valueFor(
  row: PlaceTranslationRecord['localisations'][number],
  field: PlaceTranslationField,
) {
  const value = row[field]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toApplication(entry: FixtureEntry, sourceText: string) {
  return {
    field: entry.field,
    locale: entry.targetLocale,
    text: entry.text,
    provenance:
      entry.verificationStatus === 'human-verified'
        ? ('human-translated' as const)
        : ('ai-translated' as const),
    sourceLocale: entry.sourceLocale,
    sourceText,
    sourceTextHash: entry.sourceTextHash,
  }
}

function touchEntry(entry: FixtureEntry, recordId: string, release: string) {
  entry.recordIds = [
    ...new Set([...(entry.recordIds ?? [entry.recordId]), recordId]),
  ].sort()
  entry.firstSeenRelease =
    [entry.firstSeenRelease, release].sort()[0] ?? entry.firstSeenRelease
  entry.lastSeenRelease =
    [entry.lastSeenRelease, release].sort().at(-1) ?? entry.lastSeenRelease
}

async function translateInBatches(
  texts: string[],
  options: {
    from: AzureTranslationLocale
    to: AzureTranslationLocale
    translate?: (
      texts: Iterable<string>,
      options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
    ) => Promise<Map<string, string>>
  },
) {
  const result = new Map<string, string>()
  for (let index = 0; index < texts.length; index += PLACE_TRANSLATION_BATCH_SIZE) {
    const batch = texts.slice(index, index + PLACE_TRANSLATION_BATCH_SIZE)
    const translated = await (options.translate ?? translateWithAzure)(batch, options)
    for (const [source, text] of translated) result.set(source, text)
  }
  return result
}

async function translateWithAzure(
  texts: Iterable<string>,
  options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
) {
  return translateAzureTexts(texts, {
    from: options.from,
    region: AZURE_TRANSLATION_REGION,
    to: options.to,
  })
}

function normaliseLocale(value: string): Locale {
  const locale = value.trim().toLowerCase().replaceAll('_', '-')
  if (locale === 'en' || locale === 'eng' || locale === 'english') return 'en'
  if (['zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(locale)) return 'zh-hant'
  if (['zh-hans', 'zh-cn', 'zh-sg', 'zh'].includes(locale)) return 'zh-hans'
  throw new Error(`Unsupported Places translation locale: ${value}`)
}

function azureLocale(locale: Locale): AzureTranslationLocale {
  return locale === 'en' ? 'en' : locale === 'zh-hant' ? 'zh-Hant' : 'zh-Hans'
}

function hashText(value: string) {
  return createHash('sha256').update(normaliseSourceText(value)).digest('hex')
}

function normaliseSourceText(value: string) {
  return value.normalize('NFKC').replaceAll(/\s+/g, ' ').trim()
}

function hashContext(context: Record<string, string | null> | undefined) {
  const normalised = Object.fromEntries(
    Object.entries(context ?? {})
      .map(([key, value]) => [
        key,
        value?.normalize('NFKC').replaceAll(/\s+/g, ' ').trim() || null,
      ])
      .sort(([left], [right]) => (left ?? '').localeCompare(right ?? '')),
  )
  return hashText(JSON.stringify(normalised))
}

function entryContextHash(entry: FixtureEntry) {
  return entry.contextHash ?? hashContext(entry.context)
}

function dedupeEntries(entries: FixtureEntry[]) {
  const byKey = new Map<string, FixtureEntry>()
  for (const entry of entries) {
    const key = [
      entry.field,
      entryContextHash(entry),
      entry.sourceLocale,
      entry.sourceTextHash,
      entry.targetLocale,
    ].join('\u0000')
    const existing = byKey.get(key)
    if (existing && existing.text !== entry.text)
      throw new Error(`Conflicting Places translation fixture entries for ${key}.`)
    if (existing) touchEntry(existing, entry.recordId, entry.lastSeenRelease)
    else byKey.set(key, entry)
  }
  return [...byKey.values()]
}

function compareEntries(left: FixtureEntry, right: FixtureEntry) {
  return (
    left.field.localeCompare(right.field) ||
    entryContextHash(left).localeCompare(entryContextHash(right)) ||
    left.sourceLocale.localeCompare(right.sourceLocale) ||
    left.sourceTextHash.localeCompare(right.sourceTextHash) ||
    left.targetLocale.localeCompare(right.targetLocale)
  )
}

async function readFixture(path: string, datasetCode: string): Promise<Fixture> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<Fixture>
    if (
      parsed.version !== 1 ||
      parsed.datasetCode !== datasetCode ||
      !Array.isArray(parsed.entries)
    )
      throw new Error(`Invalid Places translation fixture: ${path}`)
    return {
      datasetCode,
      entries: dedupeEntries(parsed.entries as FixtureEntry[]),
      version: 1,
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return { datasetCode, entries: [], version: 1 }
    throw error
  }
}

async function writeFixture(path: string, fixture: Fixture) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}
