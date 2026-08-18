import { confirm, isCancel, note, select, text } from '@clack/prompts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  statsAggregations,
  statsStatisticKinds,
  computeVersionHash,
  type StatsAggregation,
  type StatsStatisticKind,
} from '@repo/db'

import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'
import { translateAzureTexts } from '../sources/landsd/street/landsdStreetTranslation.ts'
import { formatField } from '../cli/display.ts'
import {
  colorGrey,
  colorRed,
  colorTeal,
  colorYellow,
} from '../localPipeline/progressFormatting.ts'

export type CenstatdMeasureCurationEntry = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  datasetCode: string
  denominatorMeasureCode?: string | null
  localisations: readonly CenstatdMeasureLocalisation[]
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  measureCode: string
  schemaSpecification?: {
    sha256: string
    url: string
  }
  sourceNullOption?: string | null
  sourceField: string
  unitCode: string
}
export type CenstatdMeasureCurationManifest = {
  measures: CenstatdMeasureCurationEntry[]
  schemaVersion: 5
}
export type CenstatdMeasureForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}
export type CenstatdMeasureMetadata = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  denominatorMeasureCode?: string | null
  localisations: readonly CenstatdMeasureLocalisation[]
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  measureCode: string
  sourceNullOption?: string | null
  unitCode: string
}

export type CenstatdMeasureLocalisation = {
  description: string
  isTranslationVerified: boolean
  locale: 'en' | 'zh-Hans' | 'zh-Hant'
  name: string
}

type CenstatdSchemaMeasureCandidate = {
  localisations: readonly CenstatdMeasureLocalisation[]
  measureCode: string
  sourceReleaseUrl: string
  schemaSpecification: {
    sha256: string
    url: string
  }
  sourceNullOption: string
}

const DEFAULT_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics.json',
)
const DEFAULT_UNITS_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/units/standard.json',
)

type UnitRegistryFixture = {
  versionHash: string
  units: Array<{
    code: string
    dimension: string
    symbol: string
    i18n: Array<{
      locale: 'en' | 'zh-Hans' | 'zh-Hant'
      name: string
      description?: string
    }>
  }>
}

export async function resolveCenstatdMeasureMetadata(input: {
  measures: readonly CenstatdMeasureForCuration[]
  promptForCuration: boolean
}) {
  let manifest = await loadCenstatdMeasureCuration(DEFAULT_CURATION_PATH)
  const schemaCandidates = await resolveCenstatdSchemaMeasureCandidates(input.measures)
  let resolved = resolveCenstatdMeasureCuration({
    manifest,
    measures: input.measures,
  })
  if (resolved.unresolved.length && input.promptForCuration) {
    manifest = await promptForCenstatdMeasureCuration({
      manifest,
      measures: resolved.unresolved,
      persist: manifest => saveCenstatdMeasureCuration(DEFAULT_CURATION_PATH, manifest),
      schemaCandidates,
    })
    resolved = resolveCenstatdMeasureCuration({ manifest, measures: input.measures })
  }
  if (resolved.unresolved.length) {
    throw new Error(
      `C&SD measure metadata requires curation for ${resolved.unresolved.map(measure => `${measure.datasetCode}/${measure.sourceField}`).join(', ')}. Rerun without --yes to review the measures.`,
    )
  }
  return resolved.metadata
}

export async function loadCenstatdMeasureCuration(path = DEFAULT_CURATION_PATH) {
  try {
    return parseCenstatdMeasureCuration(JSON.parse(await readFile(path, 'utf8')), path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return emptyCenstatdMeasureCuration()
    throw error
  }
}

export async function saveCenstatdMeasureCuration(
  path: string,
  manifest: CenstatdMeasureCurationManifest,
) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Prompts for and persists a registry record before a new unit is referenced. */
async function ensureCenstatdUnit(input: { code: string; path: string }) {
  if (input.code === 'publisher-unknown') return
  const fixture = await loadUnitRegistryFixture(input.path)
  if (fixture.units.some(unit => unit.code === input.code)) return
  note(formatField('unit code', input.code), 'NEW UNIT')
  const dimension = await requiredText('Unit dimension', undefined)
  const symbol = await requiredText('Unit symbol', undefined)
  const name = await requiredText('English unit name', undefined)
  const description = await requiredText('English unit description', undefined)
  const i18n = await resolveUnitLocalisations({ description, name })
  const units = [
    ...fixture.units,
    {
      code: input.code,
      dimension,
      symbol,
      i18n,
    },
  ].sort((left, right) => left.code.localeCompare(right.code))
  const versionHash = computeVersionHash({ units })
  await writeFile(
    input.path,
    `${JSON.stringify({ units, versionHash }, null, 2)}\n`,
    'utf8',
  )
}

async function loadUnitRegistryFixture(path: string): Promise<UnitRegistryFixture> {
  const fixture = JSON.parse(
    await readFile(path, 'utf8'),
  ) as Partial<UnitRegistryFixture>
  if (!Array.isArray(fixture.units) || typeof fixture.versionHash !== 'string')
    throw new Error(`Invalid unit registry fixture: ${path}.`)
  return fixture as UnitRegistryFixture
}

export async function resolveUnitLocalisations(input: {
  description: string
  name: string
  translate?: typeof translateAzureTexts
}) {
  const translate = input.translate ?? translateAzureTexts
  const texts = [input.name, input.description]
  const [zhHant, zhHans] = await Promise.all([
    translate(texts, { from: 'en', to: 'zh-Hant' }),
    translate(texts, { from: 'en', to: 'zh-Hans' }),
  ])
  return [
    { description: input.description, locale: 'en' as const, name: input.name },
    unitLocalisationFromTranslation(zhHant, input, 'zh-Hant'),
    unitLocalisationFromTranslation(zhHans, input, 'zh-Hans'),
  ]
}

function unitLocalisationFromTranslation(
  translated: ReadonlyMap<string, string>,
  english: { description: string; name: string },
  locale: 'zh-Hans' | 'zh-Hant',
) {
  const name = translated.get(english.name)
  const description = translated.get(english.description)
  if (!name || !description)
    throw new Error(`Azure Translator returned an incomplete ${locale} unit proposal.`)
  return { description, locale, name }
}

export function resolveCenstatdMeasureCuration(input: {
  manifest: CenstatdMeasureCurationManifest
  measures: readonly CenstatdMeasureForCuration[]
}) {
  const decisions = new Map(
    input.manifest.measures.map(item => [measureKey(item), item] as const),
  )
  const unresolved = input.measures.filter(
    measure => !decisions.has(measureKey(measure)),
  )
  return {
    metadata: new Map(
      input.measures.flatMap(measure => {
        const decision = decisions.get(measureKey(measure))
        return decision
          ? [
              [
                measureKey(measure),
                {
                  aggregation: decision.aggregation,
                  ...(decision.denominatorMeasureCode === undefined
                    ? {}
                    : { denominatorMeasureCode: decision.denominatorMeasureCode }),
                  localisations: decision.localisations,
                  measureCode: decision.measureCode,
                  ...(decision.sourceNullOption === undefined
                    ? {}
                    : { sourceNullOption: decision.sourceNullOption }),
                  statisticKind: decision.statisticKind,
                  unitCode: decision.unitCode,
                },
              ] as const,
            ]
          : []
      }),
    ),
    unresolved,
  }
}

export async function promptForCenstatdMeasureCuration(input: {
  manifest: CenstatdMeasureCurationManifest
  measures: readonly CenstatdMeasureForCuration[]
  persist?: (manifest: CenstatdMeasureCurationManifest) => Promise<void>
  schemaCandidates: ReadonlyMap<string, CenstatdSchemaMeasureCandidate>
}) {
  const decisions = [...input.manifest.measures]
  const persist = () =>
    input.persist?.({ measures: decisions, schemaVersion: 5 }) ?? Promise.resolve()
  for (const measure of input.measures) {
    const schemaCandidate = input.schemaCandidates.get(measureKey(measure))
    note(
      formatCenstatdMeasureReviewContext({ measure, schemaCandidate }),
      'MEASURE METADATA',
    )

    let measureCode: string | null = null
    let localisations: readonly CenstatdMeasureLocalisation[] | null = null
    let acceptedSchemaCandidate = false
    if (schemaCandidate) {
      note(
        formatCenstatdMeasureProposal({
          candidate: schemaCandidate,
          sourceField: measure.sourceField,
          suggestedUnitCode: suggestUnitCode(schemaCandidate.measureCode, decisions),
        }),
        'PROPOSALS',
      )
      const accepted = await confirm({
        initialValue: true,
        message: 'Accept the proposed CSDI measure name and description?',
      })
      if (isCancel(accepted)) throw new Error('C&SD measure curation cancelled.')
      if (accepted) {
        acceptedSchemaCandidate = true
        measureCode = schemaCandidate.measureCode
        localisations = schemaCandidate.localisations
      }
    }

    if (!measureCode || !localisations) {
      measureCode = await requiredMeasureCode(
        'Canonical measure key',
        schemaCandidate?.measureCode ?? suggestMeasureName(measure.sourceField),
      )
      const englishName = await requiredText(
        'English measure name',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.name ??
          suggestMeasureName(measure.sourceField),
      )
      const englishDescription = await requiredText(
        'English measure description',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.description,
      )
      const chineseProposals = await resolveChineseLocalisationProposals({
        candidate: schemaCandidate,
        englishDescription,
        englishName,
      })
      const traditionalChineseName = await requiredText(
        'Traditional Chinese measure name',
        chineseProposals.zhHant?.name,
      )
      const traditionalChineseDescription = await requiredText(
        'Traditional Chinese measure description',
        chineseProposals.zhHant?.description,
      )
      const simplifiedChineseName = await requiredText(
        'Simplified Chinese measure name',
        chineseProposals.zhHans?.name,
      )
      const simplifiedChineseDescription = await requiredText(
        'Simplified Chinese measure description',
        chineseProposals.zhHans?.description,
      )
      localisations = [
        {
          description: englishDescription,
          isTranslationVerified: true,
          locale: 'en',
          name: englishName,
        },
        {
          description: traditionalChineseDescription,
          isTranslationVerified: isLocalisationVerified(
            chineseProposals.zhHant,
            traditionalChineseName,
            traditionalChineseDescription,
          ),
          locale: 'zh-Hant',
          name: traditionalChineseName,
        },
        {
          description: simplifiedChineseDescription,
          isTranslationVerified: isLocalisationVerified(
            chineseProposals.zhHans,
            simplifiedChineseName,
            simplifiedChineseDescription,
          ),
          locale: 'zh-Hans',
          name: simplifiedChineseName,
        },
      ]
    }

    const suggestedUnitCode = suggestUnitCode(measureCode, decisions)
    const statisticKind = await selectStatisticKind({
      localisations,
      measure,
      measureCode,
      suggestedUnitCode,
    })
    const aggregation = await selectAggregation({
      statisticKind,
      suggestedAggregation: suggestAggregation(localisations),
    })
    const denominatorMeasureCode = await optionalDenominatorMeasureCode({
      statisticKind,
    })
    const resolvedUnitCode = acceptedSchemaCandidate
      ? (suggestedUnitCode ?? measure.unitCode)
      : await promptForCenstatdUnitCode(measure.unitCode, suggestedUnitCode)
    await ensureCenstatdUnit({ code: resolvedUnitCode, path: DEFAULT_UNITS_PATH })
    decisions.push({
      aggregation,
      datasetCode: measure.datasetCode,
      ...(denominatorMeasureCode ? { denominatorMeasureCode } : {}),
      localisations,
      measureCode,
      ...(schemaCandidate
        ? {
            schemaSpecification: schemaCandidate.schemaSpecification,
            sourceNullOption: schemaCandidate.sourceNullOption,
          }
        : {}),
      sourceField: measure.sourceField,
      statisticKind,
      unitCode: resolvedUnitCode,
    })
    await persist()
  }
  return { measures: decisions, schemaVersion: 5 as const }
}

async function promptForCenstatdUnitCode(
  sourceUnitCode: string,
  suggestedUnitCode: string | null,
) {
  const unitCode = await text({
    initialValue:
      sourceUnitCode === 'publisher-unknown'
        ? (suggestedUnitCode ?? '')
        : sourceUnitCode,
    message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
  })
  if (isCancel(unitCode)) throw new Error('C&SD measure curation cancelled.')
  return (unitCode ?? '').trim() || 'publisher-unknown'
}

/** Gives enough semantic context to review a measure before choosing its kind. */
export function formatCenstatdMeasureReviewContext(input: {
  measure: CenstatdMeasureForCuration
  schemaCandidate?: Pick<
    CenstatdSchemaMeasureCandidate,
    'localisations' | 'sourceReleaseUrl'
  >
}) {
  const proposed = schemaCandidateLocalisation(input.schemaCandidate, 'en')
  return [
    formatField('dataset', input.measure.datasetCode),
    formatField(
      'proposed name',
      proposed?.name ?? suggestMeasureName(input.measure.sourceField),
    ),
    ...(proposed?.description
      ? [formatField('proposed description', proposed.description)]
      : []),
    formatField('value kind', input.measure.valueKind),
    ...(input.schemaCandidate
      ? [formatField('source release', input.schemaCandidate.sourceReleaseUrl)]
      : []),
  ].join('\n')
}

export function emptyCenstatdMeasureCuration(): CenstatdMeasureCurationManifest {
  return { measures: [], schemaVersion: 5 }
}

function measureKey(
  measure: Pick<CenstatdMeasureForCuration, 'datasetCode' | 'sourceField'>,
) {
  return `${measure.datasetCode}\u0000${measure.sourceField}`
}

function parseCenstatdMeasureCuration(value: unknown, path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid C&SD measure curation manifest: ${path}.`)
  const manifest = value as Partial<CenstatdMeasureCurationManifest>
  if (manifest.schemaVersion !== 5 || !Array.isArray(manifest.measures))
    throw new Error(`Invalid C&SD measure curation manifest: ${path}.`)
  const measures = manifest.measures.map((measure, index) => {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure))
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}.`)
    const entry = measure as Partial<CenstatdMeasureCurationEntry>
    for (const field of ['datasetCode', 'sourceField', 'unitCode'] as const)
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new Error(`Invalid C&SD measure curation ${field}: ${path}.`)
    if (
      typeof entry.measureCode !== 'string' ||
      !/^[a-z][A-Za-z0-9]*$/.test(entry.measureCode)
    ) {
      throw new Error(`Invalid C&SD canonical measure key: ${path}.`)
    }
    if (
      typeof entry.statisticKind !== 'string' ||
      !statsStatisticKinds.includes(entry.statisticKind as StatsStatisticKind)
    )
      throw new Error(`Invalid C&SD statistic kind: ${path}.`)
    if (
      typeof entry.aggregation !== 'string' ||
      !statsAggregations.includes(entry.aggregation as StatsAggregation)
    )
      throw new Error(`Invalid C&SD aggregation: ${path}.`)
    if (!Array.isArray(entry.localisations) || entry.localisations.length === 0)
      throw new Error(`Missing C&SD measure localisations: ${path}.`)
    const locales = new Set<string>()
    for (const localisation of entry.localisations) {
      if (
        !localisation ||
        typeof localisation !== 'object' ||
        Array.isArray(localisation) ||
        !['en', 'zh-Hans', 'zh-Hant'].includes(localisation.locale) ||
        typeof localisation.name !== 'string' ||
        !localisation.name.trim() ||
        typeof localisation.description !== 'string' ||
        !localisation.description.trim() ||
        typeof localisation.isTranslationVerified !== 'boolean' ||
        locales.has(localisation.locale)
      ) {
        throw new Error(`Invalid C&SD measure localisation: ${path}.`)
      }
      locales.add(localisation.locale)
    }
    if (!locales.has('en'))
      throw new Error(`Missing English C&SD measure localisation: ${path}.`)
    if (
      entry.sourceNullOption !== undefined &&
      entry.sourceNullOption !== null &&
      typeof entry.sourceNullOption !== 'string'
    ) {
      throw new Error(`Invalid C&SD measure source null option: ${path}.`)
    }
    if (
      entry.denominatorMeasureCode !== undefined &&
      entry.denominatorMeasureCode !== null &&
      (typeof entry.denominatorMeasureCode !== 'string' ||
        !/^[a-z][A-Za-z0-9]*$/.test(entry.denominatorMeasureCode))
    )
      throw new Error(`Invalid C&SD denominator measure key: ${path}.`)
    if (entry.schemaSpecification !== undefined) {
      const schemaSpecification = entry.schemaSpecification
      if (
        !schemaSpecification ||
        typeof schemaSpecification !== 'object' ||
        Array.isArray(schemaSpecification) ||
        typeof schemaSpecification.url !== 'string' ||
        !schemaSpecification.url.trim() ||
        typeof schemaSpecification.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(schemaSpecification.sha256)
      ) {
        throw new Error(`Invalid C&SD measure schema specification: ${path}.`)
      }
    }
    return entry as CenstatdMeasureCurationEntry
  })
  const keys = new Set(measures.map(measureKey))
  if (keys.size !== measures.length)
    throw new Error(`Duplicate C&SD measure curation entry: ${path}.`)
  const measureCodes = new Set(
    measures.map(measure => `${measure.datasetCode}\u0000${measure.measureCode}`),
  )
  if (measureCodes.size !== measures.length)
    throw new Error(`Duplicate C&SD canonical measure key: ${path}.`)
  return { measures, schemaVersion: 5 as const }
}

/**
 * Reads CSDI's simplified data specification when the native GML does not
 * describe its fields. The registry URL remains authoritative; the static
 * host serves the same immutable specification without the portal's session
 * gate. A retrieval failure deliberately falls back to manual curation.
 */
export async function resolveCenstatdSchemaMeasureCandidates(
  measures: readonly CenstatdMeasureForCuration[],
) {
  const datasetCodes = new Set(measures.map(measure => measure.datasetCode))
  const fixtures = await loadDatasetFixtures(datasetCodes)
  const candidates = new Map<string, CenstatdSchemaMeasureCandidate>()

  await Promise.all(
    fixtures.map(async dataset => {
      const specificationUrl = staticCsdiSpecificationUrl(
        dataset.schemaSpecificationURL,
      )
      if (!specificationUrl) return
      const fields = await fetchCsdiSpecification(specificationUrl)
      if (!fields.length) return
      const matches = measures.flatMap(measure => {
        if (measure.datasetCode !== dataset.code) return []
        const schema = uniqueSchemaField(
          fields.filter(field => field.sourceField === measure.sourceField),
        )
        return schema ? [{ measure, schema }] : []
      })
      const translations = await resolveMissingCsdiLocalisations(
        matches.map(match => match.schema),
      )
      for (const { measure, schema } of matches) {
        const zhHant = resolvedCsdiLocalisation(schema, 'zh-Hant', translations.zhHant)
        const zhHans = resolvedCsdiLocalisation(schema, 'zh-Hans', translations.zhHans)
        candidates.set(measureKey(measure), {
          localisations: [
            {
              description: schema.descriptionEn,
              isTranslationVerified: true,
              locale: 'en',
              name: schema.descriptionEn,
            },
            {
              description: zhHant,
              isTranslationVerified: schema.descriptionZhHant !== null,
              locale: 'zh-Hant',
              name: zhHant,
            },
            {
              description: zhHans,
              isTranslationVerified: schema.descriptionZhHans !== null,
              locale: 'zh-Hans',
              name: zhHans,
            },
          ],
          measureCode: suggestMeasureName(schema.descriptionEn),
          sourceReleaseUrl: dataset.sourceUrl ?? specificationUrl,
          schemaSpecification: {
            sha256: schema.sha256,
            url: specificationUrl,
          },
          sourceNullOption: schema.nullOption,
        })
      }
    }),
  )
  return candidates
}

type CsdiSpecificationField = {
  dataType: string
  descriptionEn: string
  descriptionZhHans: string | null
  descriptionZhHant: string | null
  nullOption: string
  sha256: string
  sourceField: string
}

async function fetchCsdiSpecification(url: string): Promise<CsdiSpecificationField[]> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return []
    const body = await response.text()
    return parseCsdiSimplifiedDataSpecification(body)
  } catch {
    return []
  }
}

export function parseCsdiSimplifiedDataSpecification(html: string) {
  const sha256 = createHash('sha256').update(html).digest('hex')
  const fields: CsdiSpecificationField[] = []
  for (const table of html.match(/<table(?:\s[^>]*)?>[\s\S]*?<\/table>/gi) ?? []) {
    const rows = table.match(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi) ?? []
    const header =
      table.match(/<thead(?:\s[^>]*)?>([\s\S]*?)<\/thead>/i)?.[1] ?? rows.shift()
    if (!header || !/field\s*name/i.test(htmlText(header))) continue
    for (const row of rows) {
      const cells = (row.match(/<td(?:\s[^>]*)?>[\s\S]*?<\/td>/gi) ?? []).map(htmlText)
      const sourceField = cells[0]?.trim()
      const dataType = cells[1]?.trim()
      const nullOption = cells[2]?.trim()
      const descriptionEn = cells[3]?.trim()
      const descriptionZhHant = cells[4]?.trim() || null
      const descriptionZhHans = cells[5]?.trim() || null
      if (!sourceField || !dataType || !nullOption || !descriptionEn) {
        continue
      }
      fields.push({
        dataType,
        descriptionEn,
        descriptionZhHans,
        descriptionZhHant,
        nullOption,
        sha256,
        sourceField,
      })
    }
  }
  return fields
}

async function resolveMissingCsdiLocalisations(
  fields: readonly CsdiSpecificationField[],
) {
  const zhHant = await translateMissingCsdiLocalisations(fields, 'zh-Hant')
  const zhHans = await translateMissingCsdiLocalisations(fields, 'zh-Hans')
  return { zhHans, zhHant }
}

async function translateMissingCsdiLocalisations(
  fields: readonly CsdiSpecificationField[],
  locale: 'zh-Hans' | 'zh-Hant',
) {
  const missing = fields
    .filter(field =>
      locale === 'zh-Hant'
        ? field.descriptionZhHant === null
        : field.descriptionZhHans === null,
    )
    .map(field => field.descriptionEn)
  return missing.length
    ? translateAzureTexts(missing, { from: 'en', to: locale })
    : new Map<string, string>()
}

function resolvedCsdiLocalisation(
  field: CsdiSpecificationField,
  locale: 'zh-Hans' | 'zh-Hant',
  translations: ReadonlyMap<string, string>,
) {
  const official =
    locale === 'zh-Hant' ? field.descriptionZhHant : field.descriptionZhHans
  const value = official ?? translations.get(field.descriptionEn)
  if (!value)
    throw new Error(`Missing ${locale} localisation for ${field.sourceField}.`)
  return value as Exclude<StatsAggregation, 'unreviewed'>
}

function uniqueSchemaField(fields: readonly CsdiSpecificationField[]) {
  const [candidate] = fields
  if (!candidate) return null
  return fields.every(
    field =>
      field.dataType === candidate.dataType &&
      field.descriptionEn === candidate.descriptionEn &&
      field.descriptionZhHans === candidate.descriptionZhHans &&
      field.descriptionZhHant === candidate.descriptionZhHant &&
      field.nullOption === candidate.nullOption,
  )
    ? candidate
    : null
}

function staticCsdiSpecificationUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !['portal.csdi.gov.hk', 'static.csdi.gov.hk'].includes(url.hostname)
    ) {
      return null
    }
    if (url.hostname === 'portal.csdi.gov.hk') url.hostname = 'static.csdi.gov.hk'
    return url.toString()
  } catch {
    return null
  }
}

function htmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Canonical measure names are stable camelCase identifiers. Publisher
 * descriptions remain the localised descriptions, including their units.
 */
export function suggestMeasureName(description: string) {
  const withoutParenthetical = description.replace(/\s*\([^)]*\)/g, '').trim()
  const midYear = withoutParenthetical.match(/^mid[-\s]?year\s+(.+)$/i)
  const words = midYear ? `${midYear[1]} mid year` : withoutParenthetical
  const parts = words.match(/[\p{L}\p{N}]+/gu) ?? []
  return parts
    .map((part, index) => {
      const normalised = part.toLocaleLowerCase('en')
      return index === 0
        ? normalised
        : `${normalised.slice(0, 1).toLocaleUpperCase('en')}${normalised.slice(1)}`
    })
    .join('')
}

export function formatCenstatdMeasureProposal(input: {
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations' | 'measureCode'>
  sourceField: string
  suggestedUnitCode: string | null
}) {
  const english = schemaCandidateLocalisation(input.candidate, 'en')
  const zhHant = schemaCandidateLocalisation(input.candidate, 'zh-Hant')
  const zhHans = schemaCandidateLocalisation(input.candidate, 'zh-Hans')
  if (!english || !zhHant || !zhHans)
    throw new Error('C&SD proposal is missing a required localisation.')
  return [
    `${colorRed(input.sourceField)}${colorTeal(' -> ')}${colorYellow(input.candidate.measureCode)}${input.suggestedUnitCode ? colorGrey(` (${input.suggestedUnitCode})`) : ''}`,
    '',
    formatProposalLocalisation('name', english.name, zhHant.name, zhHans.name),
    formatProposalLocalisation(
      'description',
      english.description,
      zhHant.description,
      zhHans.description,
    ),
  ].join('\n')
}

export function suggestUnitCode(
  measureCode: string,
  reviewedMeasures: readonly Pick<
    CenstatdMeasureCurationEntry,
    'measureCode' | 'unitCode'
  >[],
) {
  const measureTokens = canonicalMeasureTokens(measureCode)
  const candidates = reviewedMeasures
    .filter(entry => entry.unitCode !== 'publisher-unknown')
    .filter(entry => measureTokens.has('density') || !entry.unitCode.includes('-per-'))
    .map(entry => ({
      entry,
      score: intersectionSize(measureTokens, canonicalMeasureTokens(entry.measureCode)),
    }))
    .filter(candidate => candidate.score > 0)
  const bestScore = Math.max(...candidates.map(candidate => candidate.score), 0)
  const units = new Set(
    candidates
      .filter(candidate => candidate.score === bestScore)
      .map(candidate => candidate.entry.unitCode),
  )
  return units.size === 1 ? (units.values().next().value ?? null) : null
}

export function suggestStatisticKind(input: {
  localisations?: readonly CenstatdMeasureLocalisation[]
  measureCode: string
  unitCode: string | null
}): Exclude<StatsStatisticKind, 'unreviewed'> {
  const english = input.localisations?.find(
    localisation => localisation.locale === 'en',
  )
  const proposedText = `${english?.name ?? ''} ${english?.description ?? ''}`
  const proposedKind = suggestStatisticKindFromText(proposedText)
  if (proposedKind) return proposedKind

  const name = input.measureCode.toLocaleLowerCase('en')
  const unit = input.unitCode?.toLocaleLowerCase('en') ?? ''
  if (name.includes('percent') || name.includes('percentage') || unit === 'percent')
    return 'proportion'
  if (name.includes('ratio')) return 'ratio'
  if (name.includes('density')) return 'density'
  if (name.includes('rate') || unit.includes('-per-')) return 'rate'
  if (
    name.includes('count') ||
    name.includes('population') ||
    name.includes('number') ||
    name.includes('total')
  ) {
    return 'count'
  }
  if (name.includes('index')) return 'index'
  return 'quantity'
}

function suggestStatisticKindFromText(
  text: string,
): Exclude<StatsStatisticKind, 'unreviewed'> | null {
  if (/\b(?:percent|percentage|share)\b/i.test(text)) return 'proportion'
  if (/\bratio\b/i.test(text)) return 'ratio'
  if (/\bdensity\b/i.test(text)) return 'density'
  if (/\brate\b/i.test(text)) return 'rate'
  if (/\bindex\b/i.test(text)) return 'index'
  if (/\b(?:count|population|number|total)\b/i.test(text)) return 'count'
  return null
}

async function selectStatisticKind(input: {
  localisations: readonly CenstatdMeasureLocalisation[]
  measure: CenstatdMeasureForCuration
  measureCode: string
  suggestedUnitCode: string | null
}): Promise<Exclude<StatsStatisticKind, 'unreviewed'>> {
  const value = await select({
    initialValue: suggestStatisticKind({
      localisations: input.localisations,
      measureCode: input.measureCode,
      unitCode: input.suggestedUnitCode ?? input.measure.unitCode,
    }),
    message: 'Statistic kind',
    options: [
      {
        hint: 'Discrete entities, such as people or dwellings.',
        label: 'Count',
        value: 'count',
      },
      {
        hint: 'Physical, monetary, or other measured amount.',
        label: 'Quantity',
        value: 'quantity',
      },
      {
        hint: 'A share of a whole, whether stored as a fraction or percentage.',
        label: 'Proportion',
        value: 'proportion',
      },
      { hint: 'A comparison between two quantities.', label: 'Ratio', value: 'ratio' },
      {
        hint: 'A quantity per population or time.',
        label: 'Rate',
        value: 'rate',
      },
      {
        hint: 'A quantity per unit area.',
        label: 'Density',
        value: 'density',
      },
      { hint: 'An indexed value relative to a base.', label: 'Index', value: 'index' },
    ],
  })
  if (isCancel(value)) throw new Error('C&SD measure curation cancelled.')
  return value as Exclude<StatsStatisticKind, 'unreviewed'>
}

/**
 * Suggests an aggregation explicitly named in the publisher's proposed English
 * semantic text. This is deliberately separate from statistic-kind inference:
 * a quantity can be a total, mean, or median.
 */
export function suggestAggregation(
  localisations: readonly CenstatdMeasureLocalisation[],
): Exclude<StatsAggregation, 'unreviewed'> | null {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null

  const text = `${english.name} ${english.description}`
  const aggregationTerms: ReadonlyArray<
    readonly [RegExp, Exclude<StatsAggregation, 'unreviewed'>]
  > = [
    [/\bmedian\b/i, 'median'],
    [/\b(?:mean|average)\b/i, 'mean'],
    [/\b(?:minimum|min)\b/i, 'minimum'],
    [/\b(?:maximum|max)\b/i, 'maximum'],
    [/\b(?:total|sum)\b/i, 'total'],
    [/\bpercentile\b/i, 'percentile'],
  ]
  return aggregationTerms.find(([term]) => term.test(text))?.[1] ?? null
}

const selectableAggregations = [
  'none',
  'total',
  'mean',
  'median',
  'minimum',
  'maximum',
  'percentile',
] as const satisfies readonly Exclude<StatsAggregation, 'unreviewed'>[]

/**
 * Totals preserve additive count and quantity measures only. Summing a ratio,
 * proportion, rate, density, or index does not retain that statistic kind.
 */
export function validAggregationsForStatisticKind(
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>,
): readonly Exclude<StatsAggregation, 'unreviewed'>[] {
  return statisticKind === 'count' || statisticKind === 'quantity'
    ? selectableAggregations
    : selectableAggregations.filter(aggregation => aggregation !== 'total')
}

async function selectAggregation(input: {
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  suggestedAggregation?: Exclude<StatsAggregation, 'unreviewed'> | null
}): Promise<Exclude<StatsAggregation, 'unreviewed'>> {
  const validAggregations = validAggregationsForStatisticKind(input.statisticKind)
  const fallbackAggregation =
    input.statisticKind === 'count' || input.statisticKind === 'quantity'
      ? 'total'
      : 'none'
  const suggestedAggregation = input.suggestedAggregation
  const initialValue =
    suggestedAggregation && validAggregations.includes(suggestedAggregation)
      ? suggestedAggregation
      : fallbackAggregation
  const options: ReadonlyArray<{
    hint: string
    label: string
    value: Exclude<StatsAggregation, 'unreviewed'>
  }> = [
    {
      hint: 'No aggregation; the publisher supplies a direct value.',
      label: 'None',
      value: 'none',
    },
    { hint: 'The values are summed.', label: 'Total', value: 'total' },
    { hint: 'Arithmetic average.', label: 'Mean', value: 'mean' },
    { hint: 'Middle value.', label: 'Median', value: 'median' },
    { hint: 'Smallest value.', label: 'Minimum', value: 'minimum' },
    { hint: 'Largest value.', label: 'Maximum', value: 'maximum' },
    { hint: 'A named percentile.', label: 'Percentile', value: 'percentile' },
  ]
  const value = await select({
    initialValue,
    message: 'Aggregation',
    options: options.filter(option => validAggregations.includes(option.value)),
  })
  if (isCancel(value)) throw new Error('C&SD measure curation cancelled.')
  return value as Exclude<StatsAggregation, 'unreviewed'>
}

async function optionalDenominatorMeasureCode(input: {
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
}) {
  if (!['proportion', 'ratio', 'rate', 'density'].includes(input.statisticKind))
    return undefined
  const value = await text({
    message:
      'Canonical denominator measure key (leave blank when the base is external)',
  })
  if (isCancel(value)) throw new Error('C&SD measure curation cancelled.')
  const denominatorMeasureCode = value.trim()
  if (!denominatorMeasureCode) return undefined
  if (!/^[a-z][A-Za-z0-9]*$/.test(denominatorMeasureCode))
    throw new Error('C&SD denominator measure key must be lower camel case.')
  return denominatorMeasureCode
}

export async function resolveChineseLocalisationProposals(input: {
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations'> | undefined
  englishDescription: string
  englishName: string
  translate?: typeof translateAzureTexts
}) {
  const officialZhHant = schemaCandidateLocalisation(input.candidate, 'zh-Hant')
  const officialZhHans = schemaCandidateLocalisation(input.candidate, 'zh-Hans')
  const officialEnglish = schemaCandidateLocalisation(input.candidate, 'en')
  if (!officialEnglish || !officialZhHant || !officialZhHans)
    return { zhHans: null, zhHant: null }
  if (
    input.englishName === officialEnglish.name &&
    input.englishDescription === officialEnglish.description
  ) {
    return { zhHans: officialZhHans, zhHant: officialZhHant }
  }
  const translate = input.translate ?? translateAzureTexts
  const texts = [input.englishName, input.englishDescription]
  const [zhHant, zhHans] = await Promise.all([
    translate(texts, { from: 'en', to: 'zh-Hant' }),
    translate(texts, { from: 'en', to: 'zh-Hans' }),
  ])
  return {
    zhHans: machineLocalisation(
      zhHans,
      input.englishName,
      input.englishDescription,
      'zh-Hans',
    ),
    zhHant: machineLocalisation(
      zhHant,
      input.englishName,
      input.englishDescription,
      'zh-Hant',
    ),
  }
}

function formatProposalLocalisation(
  label: string,
  english: string,
  zhHant: string,
  zhHans: string,
) {
  return `${colorTeal(label)}: ${colorYellow(english)} ${colorGrey('(')}${colorGrey(zhHant)} ${colorTeal('/')} ${colorGrey(zhHans)}${colorGrey(')')}`
}

function schemaCandidateLocalisation(
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations'> | undefined,
  locale: CenstatdMeasureLocalisation['locale'],
) {
  return candidate?.localisations.find(localisation => localisation.locale === locale)
}

function machineLocalisation(
  translated: ReadonlyMap<string, string>,
  englishName: string,
  englishDescription: string,
  locale: CenstatdMeasureLocalisation['locale'],
): CenstatdMeasureLocalisation {
  const name = translated.get(englishName)
  const description = translated.get(englishDescription)
  if (!name || !description)
    throw new Error(
      `Azure Translator returned an incomplete ${locale} measure proposal.`,
    )
  return { description, isTranslationVerified: false, locale, name }
}

function isLocalisationVerified(
  proposal: CenstatdMeasureLocalisation | null,
  name: string,
  description: string,
) {
  return proposal && proposal.name === name && proposal.description === description
    ? proposal.isTranslationVerified
    : true
}

function canonicalMeasureTokens(value: string) {
  return new Set(
    value.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g)?.map(token => token.toLowerCase()),
  )
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return [...left].filter(value => right.has(value)).length
}

async function requiredMeasureCode(message: string, initialValue: string) {
  for (;;) {
    const value = await requiredText(message, initialValue)
    if (/^[a-z][A-Za-z0-9]*$/.test(value)) return value
    note(
      'Use a stable lower-camel-case identifier: begin with a lower-case letter and use only letters and digits.',
      'MEASURE METADATA',
    )
  }
}

async function requiredText(message: string, initialValue?: string) {
  const answer = await text({
    initialValue,
    message,
    validate: value => ((value ?? '').trim() ? undefined : 'A value is required.'),
  })
  if (isCancel(answer)) throw new Error('C&SD measure curation cancelled.')
  return (answer ?? '').trim()
}
