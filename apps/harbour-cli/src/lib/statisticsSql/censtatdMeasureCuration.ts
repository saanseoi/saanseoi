import { confirm, isCancel, note, text } from '@clack/prompts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

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
  datasetCode: string
  localisations: readonly CenstatdMeasureLocalisation[]
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
  schemaVersion: 3
}
export type CenstatdMeasureForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}
export type CenstatdMeasureMetadata = {
  localisations: readonly CenstatdMeasureLocalisation[]
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
      schemaCandidates,
    })
    await saveCenstatdMeasureCuration(DEFAULT_CURATION_PATH, manifest)
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
                  localisations: decision.localisations,
                  measureCode: decision.measureCode,
                  ...(decision.sourceNullOption === undefined
                    ? {}
                    : { sourceNullOption: decision.sourceNullOption }),
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
  schemaCandidates: ReadonlyMap<string, CenstatdSchemaMeasureCandidate>
}) {
  const decisions = [...input.manifest.measures]
  for (const measure of input.measures) {
    const schemaCandidate = input.schemaCandidates.get(measureKey(measure))
    const suggestedUnitCode = suggestUnitCode(
      schemaCandidate?.measureCode ?? suggestMeasureName(measure.sourceField),
      decisions,
    )
    note(
      [
        formatField('dataset', measure.datasetCode),
        formatField('value kind', measure.valueKind),
        ...(schemaCandidate
          ? [formatField('source release', schemaCandidate.sourceReleaseUrl)]
          : []),
      ].join('\n'),
      'MEASURE METADATA',
    )
    if (schemaCandidate) {
      note(
        formatCenstatdMeasureProposal({
          candidate: schemaCandidate,
          sourceField: measure.sourceField,
          suggestedUnitCode,
        }),
        'PROPOSALS',
      )
      const accepted = await confirm({
        initialValue: true,
        message: 'Accept the proposed CSDI measure metadata?',
      })
      if (isCancel(accepted)) throw new Error('C&SD measure curation cancelled.')
      if (accepted) {
        decisions.push({
          datasetCode: measure.datasetCode,
          localisations: schemaCandidate.localisations,
          measureCode: schemaCandidate.measureCode,
          schemaSpecification: schemaCandidate.schemaSpecification,
          sourceField: measure.sourceField,
          sourceNullOption: schemaCandidate.sourceNullOption,
          unitCode: suggestedUnitCode ?? measure.unitCode,
        })
        continue
      }
    }
    const measureCode = await requiredMeasureCode(
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
    const unitCode = await text({
      initialValue:
        measure.unitCode === 'publisher-unknown'
          ? (suggestedUnitCode ?? '')
          : measure.unitCode,
      message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
    })
    if (isCancel(unitCode)) throw new Error('C&SD measure curation cancelled.')
    decisions.push({
      datasetCode: measure.datasetCode,
      localisations: [
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
      ],
      measureCode,
      ...(schemaCandidate
        ? {
            schemaSpecification: schemaCandidate.schemaSpecification,
            sourceNullOption: schemaCandidate.sourceNullOption,
          }
        : {}),
      sourceField: measure.sourceField,
      unitCode: (unitCode ?? '').trim() || 'publisher-unknown',
    })
  }
  return { measures: decisions, schemaVersion: 3 as const }
}

export function emptyCenstatdMeasureCuration(): CenstatdMeasureCurationManifest {
  return { measures: [], schemaVersion: 3 }
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
  if (manifest.schemaVersion !== 3 || !Array.isArray(manifest.measures))
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
  return { measures, schemaVersion: 3 as const }
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
  return value
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
  for (;;) {
    const answer = await text({ initialValue, message })
    if (isCancel(answer)) throw new Error('C&SD measure curation cancelled.')
    const value = (answer ?? '').trim()
    if (value) return value
    note('A value is required.', 'MEASURE METADATA')
  }
}
