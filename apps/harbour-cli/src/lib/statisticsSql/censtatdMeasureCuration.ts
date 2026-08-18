import { isCancel, note, text } from '@clack/prompts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'
import { translateAzureTexts } from '../sources/landsd/street/landsdStreetTranslation.ts'

export type CenstatdMeasureCurationEntry = {
  datasetCode: string
  localisations: readonly CenstatdMeasureLocalisation[]
  schemaSpecification?: {
    sha256: string
    url: string
  }
  sourceField: string
  unitCode: string
}
export type CenstatdMeasureCurationManifest = {
  measures: CenstatdMeasureCurationEntry[]
  schemaVersion: 2
}
export type CenstatdMeasureForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}
export type CenstatdMeasureMetadata = {
  localisations: readonly CenstatdMeasureLocalisation[]
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
  const metadata = new Map<string, CenstatdMeasureMetadata>()
  for (const [key, candidate] of schemaCandidates) {
    const measure = input.measures.find(item => measureKey(item) === key)
    if (!measure) continue
    metadata.set(key, {
      localisations: candidate.localisations,
      sourceNullOption: candidate.sourceNullOption,
      unitCode: measure.unitCode,
    })
  }
  const unresolved = input.measures.filter(
    measure => !schemaCandidates.has(measureKey(measure)),
  )
  const manuallyResolved = resolveCenstatdMeasureCuration({
    manifest,
    measures: unresolved,
  })
  if (manuallyResolved.unresolved.length && input.promptForCuration) {
    manifest = await promptForCenstatdMeasureCuration({
      manifest,
      measures: manuallyResolved.unresolved,
    })
    await saveCenstatdMeasureCuration(DEFAULT_CURATION_PATH, manifest)
  }
  if (unresolved.length) {
    const resolved = resolveCenstatdMeasureCuration({ manifest, measures: unresolved })
    for (const [key, value] of resolved.metadata) metadata.set(key, value)
  }
  const remaining = input.measures.filter(measure => !metadata.has(measureKey(measure)))
  if (remaining.length) {
    throw new Error(
      `C&SD measure metadata requires curation for ${remaining.map(measure => `${measure.datasetCode}/${measure.sourceField}`).join(', ')}. Rerun without --yes to review the measures.`,
    )
  }
  return metadata
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
}) {
  const decisions = [...input.manifest.measures]
  for (const measure of input.measures) {
    note(
      `Dataset: ${measure.datasetCode}\nPublisher field: ${measure.sourceField}\nValue kind: ${measure.valueKind}`,
      'MEASURE METADATA',
    )
    const name = await requiredText(
      'English measure name',
      suggestMeasureName(measure.sourceField),
    )
    const description = await requiredText('English measure description')
    const unitCode = await text({
      initialValue: measure.unitCode === 'publisher-unknown' ? '' : measure.unitCode,
      message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
    })
    if (isCancel(unitCode)) throw new Error('C&SD measure curation cancelled.')
    decisions.push({
      datasetCode: measure.datasetCode,
      localisations: [
        {
          description,
          isTranslationVerified: true,
          locale: 'en',
          name,
        },
      ],
      sourceField: measure.sourceField,
      unitCode: (unitCode ?? '').trim() || 'publisher-unknown',
    })
  }
  return { measures: decisions, schemaVersion: 2 as const }
}

export function emptyCenstatdMeasureCuration(): CenstatdMeasureCurationManifest {
  return { measures: [], schemaVersion: 2 }
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
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.measures))
    throw new Error(`Invalid C&SD measure curation manifest: ${path}.`)
  const measures = manifest.measures.map((measure, index) => {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure))
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}.`)
    const entry = measure as Partial<CenstatdMeasureCurationEntry>
    for (const field of ['datasetCode', 'sourceField', 'unitCode'] as const)
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new Error(`Invalid C&SD measure curation ${field}: ${path}.`)
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
  return { measures, schemaVersion: 2 as const }
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

async function requiredText(message: string, initialValue?: string) {
  for (;;) {
    const answer = await text({ initialValue, message })
    if (isCancel(answer)) throw new Error('C&SD measure curation cancelled.')
    const value = (answer ?? '').trim()
    if (value) return value
    note('A value is required.', 'MEASURE METADATA')
  }
}
