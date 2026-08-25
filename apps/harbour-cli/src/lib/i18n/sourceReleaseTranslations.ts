import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { isDatasetReleaseCode } from '@repo/core'

import {
  AZURE_TRANSLATION_MACHINE,
  AZURE_TRANSLATION_REGION,
  translateAzureTexts,
  type AzureTranslationLocale,
} from '../sources/landsd/street/landsdStreetTranslation.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const FIXTURE_ROOT = resolve(REPO_ROOT, 'fixtures/i18n/source-releases')
const REQUIRED_LOCALES = ['en', 'zh-hant', 'zh-hans'] as const

type I18nLocale = (typeof REQUIRED_LOCALES)[number]

type FixtureEntry = {
  field: 'name'
  isTranslationVerified: false
  machine: typeof AZURE_TRANSLATION_MACHINE
  recordId: string
  sourceLocale: I18nLocale
  sourceTextHash: string
  targetLocale: I18nLocale
  text: string
}

type SourceReleaseTranslationFixture = {
  entries: FixtureEntry[]
  sourceRelease: string
  version: 1
}

export type SourceReleaseLocalisation = {
  locale: string
  name: string
}

type NormalisedSourceReleaseLocalisation = {
  locale: I18nLocale
  name: string
}

export type SourceReleaseTranslationRecord = {
  localisations: SourceReleaseLocalisation[]
  recordId: string
}

export type SourceReleaseTranslationResult = {
  localisations: SourceReleaseLocalisation[]
  sourceLocales: I18nLocale[]
  translatedLocales: I18nLocale[]
}

/**
 * Completes the three supported API name locales from a source-release-keyed fixture.
 * A local import creates missing entries through Azure Translator, then writes them to
 * the repository fixture so the next import is deterministic and the values can be
 * reviewed.
 */
export async function resolveSourceReleaseNameTranslations(input: {
  allowGeneration?: boolean
  fixturePath?: string
  localisations: SourceReleaseLocalisation[]
  recordId: string
  sourceRelease: string
  translate?: (
    texts: Iterable<string>,
    options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
  ) => Promise<Map<string, string>>
}): Promise<SourceReleaseTranslationResult> {
  const results = await resolveSourceReleaseNameTranslationsBatch({
    allowGeneration: input.allowGeneration,
    fixturePath: input.fixturePath,
    records: [
      {
        localisations: input.localisations,
        recordId: input.recordId,
      },
    ],
    sourceRelease: input.sourceRelease,
    translate: input.translate,
  })
  const result = results.get(input.recordId)
  if (!result) {
    throw new Error(
      `Missing source-release i18n result for ${input.sourceRelease}/${input.recordId}.`,
    )
  }
  return result
}

/**
 * Resolves all missing names for one source release. Translation requests are grouped
 * by source and target locale, and distinct source texts are submitted together. This
 * keeps a local import reproducible after its generated fixture is written.
 */
export async function resolveSourceReleaseNameTranslationsBatch(input: {
  /** Only a local import may create reviewable fixture entries. */
  allowGeneration?: boolean
  fixturePath?: string
  records: SourceReleaseTranslationRecord[]
  sourceRelease: string
  translate?: (
    texts: Iterable<string>,
    options: { from: AzureTranslationLocale; to: AzureTranslationLocale },
  ) => Promise<Map<string, string>>
}): Promise<Map<string, SourceReleaseTranslationResult>> {
  const fixturePath =
    input.fixturePath ?? sourceReleaseTranslationFixturePath(input.sourceRelease)
  const fixture = await readFixture(fixturePath, input.sourceRelease)
  const recordsById = new Map(
    input.records.map(record => [record.recordId, record] as const),
  )
  if (recordsById.size !== input.records.length) {
    throw new Error(
      `Duplicate record IDs in source-release i18n input: ${input.sourceRelease}`,
    )
  }

  const additionsByRecordId = new Map<string, SourceReleaseLocalisation[]>()
  const generated: FixtureEntry[] = []
  const unresolvedByLocalePair = new Map<
    string,
    Array<{
      recordId: string
      source: NormalisedSourceReleaseLocalisation
      sourceTextHash: string
      targetLocale: I18nLocale
    }>
  >()

  for (const record of input.records) {
    const source = sourceLocalisations(record.localisations)
    additionsByRecordId.set(record.recordId, [])

    for (const targetLocale of REQUIRED_LOCALES) {
      if (source.has(targetLocale)) continue
      const translationSource = selectTranslationSource(source, targetLocale)
      if (!translationSource) continue

      const sourceTextHash = hashText(translationSource.name)
      const cached = fixture.entries.find(
        entry =>
          entry.recordId === record.recordId &&
          entry.field === 'name' &&
          entry.targetLocale === targetLocale &&
          entry.sourceLocale === translationSource.locale &&
          entry.sourceTextHash === sourceTextHash,
      )
      if (cached) {
        additionsByRecordId.get(record.recordId)?.push({
          locale: targetLocale,
          name: cached.text,
        })
        continue
      }

      const pairKey = `${translationSource.locale}\u0000${targetLocale}`
      if (!input.allowGeneration) {
        throw new Error(
          `Missing ${targetLocale} name fixture for ${input.sourceRelease}/${record.recordId}. Run a local import to generate a reviewable translation fixture.`,
        )
      }
      const unresolved = unresolvedByLocalePair.get(pairKey) ?? []
      unresolved.push({
        recordId: record.recordId,
        source: translationSource,
        sourceTextHash,
        targetLocale,
      })
      unresolvedByLocalePair.set(pairKey, unresolved)
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
    for (const entry of unresolved) {
      const text = translated.get(entry.source.name)?.trim()
      if (!text) {
        throw new Error(
          `Missing ${entry.targetLocale} name translation for ${input.sourceRelease}/${entry.recordId}.`,
        )
      }
      additionsByRecordId.get(entry.recordId)?.push({
        locale: entry.targetLocale,
        name: text,
      })
      generated.push({
        field: 'name',
        isTranslationVerified: false,
        machine: AZURE_TRANSLATION_MACHINE,
        recordId: entry.recordId,
        sourceLocale: entry.source.locale,
        sourceTextHash: entry.sourceTextHash,
        targetLocale: entry.targetLocale,
        text,
      })
    }
  }

  if (generated.length > 0) {
    fixture.entries.push(...generated)
    fixture.entries.sort(compareFixtureEntries)
    await writeFixture(fixturePath, fixture)
  }

  return new Map(
    input.records.map(record => {
      const source = sourceLocalisations(record.localisations)
      const additions = additionsByRecordId.get(record.recordId) ?? []
      return [
        record.recordId,
        {
          localisations: [...record.localisations, ...additions].sort((left, right) =>
            left.locale.localeCompare(right.locale),
          ),
          sourceLocales: [...source.keys()].sort() as I18nLocale[],
          translatedLocales: additions
            .map(value => normaliseLocale(value.locale))
            .filter((locale): locale is I18nLocale => locale !== null)
            .sort(),
        },
      ] as const
    }),
  )
}

export function sourceReleaseTranslationFixturePath(sourceRelease: string) {
  if (!isDatasetReleaseCode(sourceRelease)) {
    throw new Error(`Invalid source release code for i18n fixture: ${sourceRelease}`)
  }
  return resolve(FIXTURE_ROOT, `${sourceRelease}.json`)
}

function sourceLocalisations(localisations: SourceReleaseLocalisation[]) {
  const values = new Map<I18nLocale, NormalisedSourceReleaseLocalisation>()
  for (const localised of localisations) {
    const locale = normaliseLocale(localised.locale)
    const name = localised.name.trim()
    if (locale && name) values.set(locale, { locale, name })
  }
  return values
}

function selectTranslationSource(
  localisations: Map<I18nLocale, NormalisedSourceReleaseLocalisation>,
  target: I18nLocale,
) {
  const order: Record<I18nLocale, I18nLocale[]> = {
    en: ['zh-hans', 'zh-hant'],
    'zh-hant': ['zh-hans', 'en'],
    'zh-hans': ['zh-hant', 'en'],
  }
  return order[target].map(locale => localisations.get(locale)).find(Boolean) ?? null
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
  switch (locale) {
    case 'en':
      return 'en'
    case 'zh-hant':
      return 'zh-Hant'
    case 'zh-hans':
      return 'zh-Hans'
  }
}

function normaliseLocale(locale: string): I18nLocale | null {
  const normalised = locale.toLowerCase()
  if (normalised === 'en') return 'en'
  if (['zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(normalised)) return 'zh-hant'
  if (['zh-hans', 'zh-cn', 'zh-sg'].includes(normalised)) return 'zh-hans'
  return null
}

async function readFixture(
  path: string,
  sourceRelease: string,
): Promise<SourceReleaseTranslationFixture> {
  try {
    const parsed = JSON.parse(
      await readFile(path, 'utf8'),
    ) as Partial<SourceReleaseTranslationFixture>
    if (
      parsed.version !== 1 ||
      parsed.sourceRelease !== sourceRelease ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error(`Invalid i18n fixture: ${path}`)
    }
    return { entries: parsed.entries as FixtureEntry[], sourceRelease, version: 1 }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { entries: [], sourceRelease, version: 1 }
    }
    throw error
  }
}

async function writeFixture(path: string, fixture: SourceReleaseTranslationFixture) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

function compareFixtureEntries(left: FixtureEntry, right: FixtureEntry) {
  return (
    left.recordId.localeCompare(right.recordId) ||
    left.field.localeCompare(right.field) ||
    left.targetLocale.localeCompare(right.targetLocale) ||
    left.sourceLocale.localeCompare(right.sourceLocale) ||
    left.sourceTextHash.localeCompare(right.sourceTextHash)
  )
}

function hashText(value: string) {
  return createHash('sha256').update(value.normalize('NFKC')).digest('hex')
}
