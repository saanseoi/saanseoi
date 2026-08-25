import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  AZURE_TRANSLATION_MACHINE,
  AZURE_TRANSLATION_REGION,
  translateAzureTexts,
  type AzureTranslationLocale,
} from '../sources/landsd/street/landsdStreetTranslation.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const DATASET_FIXTURE_ROOT = resolve(REPO_ROOT, 'fixtures/i18n/datasets')
const LEGACY_FIXTURE_ROOT = resolve(REPO_ROOT, 'fixtures/i18n/source-releases')
const REQUIRED_LOCALES = ['en', 'zh-hant', 'zh-hans'] as const

type I18nLocale = (typeof REQUIRED_LOCALES)[number]

export type TranslationProvenance = 'ai-translated' | 'human-translated'

export type DatasetTranslationLocalisation = {
  locale: string
  name: string
}

export type DatasetTranslationRecord = {
  context: Record<string, string | null>
  localisations: DatasetTranslationLocalisation[]
  recordId: string
}

export type DatasetTranslationApplication = {
  context: Record<string, string | null>
  contextHash: string
  entryKey: string
  locale: I18nLocale
  name: string
  provenance: TranslationProvenance
  sourceLocale: I18nLocale
  sourceText: string
  sourceTextHash: string
}

export type DatasetTranslationResult = {
  applications: DatasetTranslationApplication[]
  localisations: DatasetTranslationLocalisation[]
}

type FixtureEntry = {
  context: Record<string, string | null>
  contextHash: string
  field: 'name'
  firstSeenRelease: string
  lastSeenRelease: string
  machine?: typeof AZURE_TRANSLATION_MACHINE
  provenance: TranslationProvenance
  sourceLocale: I18nLocale
  sourceTextHash: string
  targetLocale: I18nLocale
  text: string
}

type DatasetTranslationFixture = {
  datasetCode: string
  entries: FixtureEntry[]
  version: 1
}

type LegacyFixtureEntry = {
  field: 'name'
  recordId: string
  sourceLocale: I18nLocale
  sourceTextHash: string
  targetLocale: I18nLocale
  text: string
}

/**
 * Resolves missing API name locales from one dataset-scoped translation memory.
 * The identity is the translated text and its dataset-defined context, rather than a
 * release record ID, so equivalent translations are reused across source releases.
 */
export async function resolveDatasetNameTranslationsBatch(input: {
  allowGeneration?: boolean
  datasetCode: string
  fixturePath?: string
  legacyFixturePath?: string
  records: DatasetTranslationRecord[]
  sourceRelease: string
  translate?: (
    texts: Iterable<string>,
    options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
  ) => Promise<Map<string, string>>
}): Promise<Map<string, DatasetTranslationResult>> {
  const fixturePath =
    input.fixturePath ?? datasetTranslationFixturePath(input.datasetCode)
  const fixture = await readFixture(fixturePath, input.datasetCode)
  const recordsById = new Map(input.records.map(record => [record.recordId, record]))
  if (recordsById.size !== input.records.length) {
    throw new Error(`Duplicate record IDs in dataset i18n input: ${input.datasetCode}`)
  }

  const legacyEntries = await readLegacyEntries(
    input.legacyFixturePath ??
      resolve(LEGACY_FIXTURE_ROOT, `${input.sourceRelease}.json`),
  )
  const additionsByRecordId = new Map<string, DatasetTranslationApplication[]>()
  const generated: FixtureEntry[] = []
  let fixtureChanged = false
  const unresolvedByLocalePair = new Map<
    string,
    Array<{
      context: Record<string, string | null>
      contextHash: string
      recordId: string
      source: { locale: I18nLocale; name: string }
      sourceTextHash: string
      targetLocale: I18nLocale
    }>
  >()

  for (const record of input.records) {
    additionsByRecordId.set(record.recordId, [])
    const localisations = sourceLocalisations(record.localisations)
    const context = normaliseContext(record.context)
    const contextHash = hashContext(context)

    for (const targetLocale of REQUIRED_LOCALES) {
      if (localisations.has(targetLocale)) continue
      const source = selectTranslationSource(localisations, targetLocale)
      if (!source) continue

      const sourceTextHash = hashText(source.name)
      const cached = fixture.entries.find(
        entry =>
          entry.field === 'name' &&
          entry.contextHash === contextHash &&
          entry.sourceLocale === source.locale &&
          entry.sourceTextHash === sourceTextHash &&
          entry.targetLocale === targetLocale,
      )
      const legacy = legacyEntries.find(
        entry =>
          entry.recordId === record.recordId &&
          entry.field === 'name' &&
          entry.sourceLocale === source.locale &&
          entry.sourceTextHash === sourceTextHash &&
          entry.targetLocale === targetLocale,
      )
      const entry =
        cached ??
        (legacy
          ? {
              context,
              contextHash,
              field: 'name' as const,
              firstSeenRelease: input.sourceRelease,
              lastSeenRelease: input.sourceRelease,
              machine: AZURE_TRANSLATION_MACHINE,
              provenance: 'ai-translated' as const,
              sourceLocale: source.locale,
              sourceTextHash,
              targetLocale,
              text: legacy.text,
            }
          : null)

      if (entry) {
        if (cached) {
          const firstSeenRelease = [cached.firstSeenRelease, input.sourceRelease]
            .sort()
            .at(0)
          const lastSeenRelease = [cached.lastSeenRelease, input.sourceRelease]
            .sort()
            .at(-1)
          if (
            cached.firstSeenRelease !== firstSeenRelease ||
            cached.lastSeenRelease !== lastSeenRelease
          ) {
            cached.firstSeenRelease = firstSeenRelease ?? cached.firstSeenRelease
            cached.lastSeenRelease = lastSeenRelease ?? cached.lastSeenRelease
            fixtureChanged = true
          }
        } else {
          generated.push(entry)
        }
        additionsByRecordId
          .get(record.recordId)
          ?.push(toApplication(entry, source.name))
        continue
      }

      if (!input.allowGeneration) {
        throw new Error(
          `Missing ${targetLocale} name fixture for ${input.datasetCode}/${record.recordId}. Run a local import to generate a reviewable translation fixture.`,
        )
      }
      const pairKey = `${source.locale}\u0000${targetLocale}`
      unresolvedByLocalePair.set(pairKey, [
        ...(unresolvedByLocalePair.get(pairKey) ?? []),
        {
          context,
          contextHash,
          recordId: record.recordId,
          source,
          sourceTextHash,
          targetLocale,
        },
      ])
    }
  }

  for (const unresolved of unresolvedByLocalePair.values()) {
    const source = unresolved[0]?.source
    if (!source) continue
    const translated = await (input.translate ?? translateWithAzure)(
      new Set(unresolved.map(value => value.source.name)),
      {
        from: azureLocale(source.locale),
        to: azureLocale(unresolved[0]?.targetLocale ?? 'en'),
      },
    )
    for (const value of unresolved) {
      const text = translated.get(value.source.name)?.trim()
      if (!text) {
        throw new Error(
          `Missing ${value.targetLocale} name translation for ${input.datasetCode}/${value.recordId}.`,
        )
      }
      const entry: FixtureEntry = {
        context: value.context,
        contextHash: value.contextHash,
        field: 'name',
        firstSeenRelease: input.sourceRelease,
        lastSeenRelease: input.sourceRelease,
        machine: AZURE_TRANSLATION_MACHINE,
        provenance: 'ai-translated',
        sourceLocale: value.source.locale,
        sourceTextHash: value.sourceTextHash,
        targetLocale: value.targetLocale,
        text,
      }
      generated.push(entry)
      additionsByRecordId
        .get(value.recordId)
        ?.push(toApplication(entry, value.source.name))
    }
  }

  if (generated.length > 0 || fixtureChanged) {
    fixture.entries.push(...generated)
    fixture.entries = dedupeEntries(fixture.entries)
    fixture.entries.sort(compareEntries)
    await writeFixture(fixturePath, fixture)
  }

  return new Map(
    input.records.map(record => {
      const applications = additionsByRecordId.get(record.recordId) ?? []
      return [
        record.recordId,
        {
          applications,
          localisations: applications.map(({ locale, name }) => ({ locale, name })),
        },
      ] as const
    }),
  )
}

export function datasetTranslationFixturePath(datasetCode: string) {
  if (!/^ds-[a-z0-9-]+$/.test(datasetCode)) {
    throw new Error(`Invalid dataset code for i18n fixture: ${datasetCode}`)
  }
  return resolve(DATASET_FIXTURE_ROOT, `${datasetCode}.json`)
}

function toApplication(
  entry: FixtureEntry,
  sourceText: string,
): DatasetTranslationApplication {
  return {
    context: entry.context,
    contextHash: entry.contextHash,
    entryKey: hashText(
      [
        entry.field,
        entry.contextHash,
        entry.sourceLocale,
        entry.sourceTextHash,
        entry.targetLocale,
      ].join('\u0000'),
    ),
    locale: entry.targetLocale,
    name: entry.text,
    provenance: entry.provenance,
    sourceLocale: entry.sourceLocale,
    sourceText,
    sourceTextHash: entry.sourceTextHash,
  }
}

function dedupeEntries(entries: FixtureEntry[]) {
  const deduplicated = new Map<string, FixtureEntry>()
  for (const entry of entries) {
    const key = [
      entry.field,
      entry.contextHash,
      entry.sourceLocale,
      entry.sourceTextHash,
      entry.targetLocale,
    ].join('\u0000')
    const existing = deduplicated.get(key)
    if (
      existing &&
      (existing.text !== entry.text || existing.provenance !== entry.provenance)
    ) {
      throw new Error(`Conflicting dataset i18n fixture entries for ${key}.`)
    }
    deduplicated.set(key, existing ?? entry)
  }
  return [...deduplicated.values()]
}

function sourceLocalisations(localisations: DatasetTranslationLocalisation[]) {
  const values = new Map<I18nLocale, { locale: I18nLocale; name: string }>()
  for (const localised of localisations) {
    const locale = normaliseLocale(localised.locale)
    const name = localised.name.trim()
    if (locale && name) values.set(locale, { locale, name })
  }
  return values
}

function selectTranslationSource(
  localisations: Map<I18nLocale, { locale: I18nLocale; name: string }>,
  target: I18nLocale,
) {
  const order: Record<I18nLocale, I18nLocale[]> = {
    en: ['zh-hans', 'zh-hant'],
    'zh-hant': ['zh-hans', 'en'],
    'zh-hans': ['zh-hant', 'en'],
  }
  return order[target].map(locale => localisations.get(locale)).find(Boolean) ?? null
}

function normaliseContext(context: Record<string, string | null>) {
  return Object.fromEntries(
    Object.entries(context)
      .map(([key, value]) => [key, value?.trim() || null] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function hashContext(context: Record<string, string | null>) {
  return hashText(JSON.stringify(context))
}

async function readFixture(
  path: string,
  datasetCode: string,
): Promise<DatasetTranslationFixture> {
  try {
    const parsed = JSON.parse(
      await readFile(path, 'utf8'),
    ) as Partial<DatasetTranslationFixture>
    if (
      parsed.version !== 1 ||
      parsed.datasetCode !== datasetCode ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error(`Invalid dataset i18n fixture: ${path}`)
    }
    return {
      datasetCode,
      entries: dedupeEntries(parsed.entries as FixtureEntry[]),
      version: 1,
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { datasetCode, entries: [], version: 1 }
    }
    throw error
  }
}

async function readLegacyEntries(path: string): Promise<LegacyFixtureEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { entries?: unknown }
    return Array.isArray(parsed.entries) ? (parsed.entries as LegacyFixtureEntry[]) : []
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeFixture(path: string, fixture: DatasetTranslationFixture) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

function compareEntries(left: FixtureEntry, right: FixtureEntry) {
  return (
    left.contextHash.localeCompare(right.contextHash) ||
    left.field.localeCompare(right.field) ||
    left.targetLocale.localeCompare(right.targetLocale) ||
    left.sourceLocale.localeCompare(right.sourceLocale) ||
    left.sourceTextHash.localeCompare(right.sourceTextHash)
  )
}

function normaliseLocale(locale: string): I18nLocale | null {
  const normalised = locale.toLowerCase()
  if (normalised === 'en') return 'en'
  if (['zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(normalised)) return 'zh-hant'
  if (['zh-hans', 'zh-cn', 'zh-sg'].includes(normalised)) return 'zh-hans'
  return null
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

function azureLocale(locale: I18nLocale): AzureTranslationLocale {
  return locale === 'en' ? 'en' : locale === 'zh-hant' ? 'zh-Hant' : 'zh-Hans'
}

function hashText(value: string) {
  return createHash('sha256').update(value.normalize('NFKC')).digest('hex')
}
