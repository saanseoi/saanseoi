import { createHash } from 'node:crypto'
import type { StatsAggregation } from '@repo/db'
import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'
import { translateAzureTexts } from '../sources/landsd/street/landsdStreetTranslation.ts'
import type {
  CenstatdFieldForCuration,
  CenstatdSchemaMeasureCandidate,
} from './censtatdMeasureCurationTypes.ts'
import { measureKey } from './censtatdMeasureCurationRegistry.ts'

/**
 * Reads CSDI's simplified data specification when the native GML does not
 * describe its fields. The registry URL remains authoritative; the static
 * host serves the same immutable specification without the portal's session
 * gate. A retrieval failure deliberately falls back to manual curation.
 */
export async function resolveCenstatdSchemaMeasureCandidates(
  fields: readonly CenstatdFieldForCuration[],
) {
  const datasetCodes = new Set(fields.map(field => field.datasetCode))
  const fixtures = await loadDatasetFixtures(datasetCodes)
  const candidates = new Map<string, CenstatdSchemaMeasureCandidate>()

  await Promise.all(
    fixtures.map(async dataset => {
      const specificationUrl = staticCsdiSpecificationUrl(dataset.schemaURL)
      if (!specificationUrl) return
      const schemaFields = await fetchCsdiSpecification(specificationUrl)
      if (!schemaFields.length) return
      const matches = fields
        .filter(field => field.datasetCode === dataset.code)
        .flatMap(field => {
          const schema = uniqueSchemaField(
            schemaFields.filter(
              candidate => candidate.sourceField === field.sourceField,
            ),
          )
          return schema ? [{ field, schema }] : []
        })
      const translations = await resolveMissingCsdiLocalisations(
        matches.map(match => match.schema),
      )
      for (const { field, schema } of matches) {
        const zhHant = resolvedCsdiLocalisation(schema, 'zh-Hant', translations.zhHant)
        const zhHans = resolvedCsdiLocalisation(schema, 'zh-Hans', translations.zhHans)
        candidates.set(measureKey(field), {
          localisations: [
            {
              description: schema.descriptionEn,
              isTranslationVerified: true,
              locale: 'en',
              name: schema.descriptionEn,
              origin: { kind: 'publisher' },
            },
            {
              description: zhHant,
              isTranslationVerified: schema.descriptionZhHant !== null,
              locale: 'zh-Hant',
              name: zhHant,
              origin:
                schema.descriptionZhHant !== null
                  ? { kind: 'publisher' }
                  : {
                      kind: 'machine-translated',
                      sourceLocale: 'en',
                      sourceName: schema.descriptionEn,
                      sourceDescription: schema.descriptionEn,
                    },
            },
            {
              description: zhHans,
              isTranslationVerified: schema.descriptionZhHans !== null,
              locale: 'zh-Hans',
              name: zhHans,
              origin:
                schema.descriptionZhHans !== null
                  ? { kind: 'publisher' }
                  : {
                      kind: 'machine-translated',
                      sourceLocale: 'en',
                      sourceName: schema.descriptionEn,
                      sourceDescription: schema.descriptionEn,
                    },
            },
          ],
          fieldName: suggestMeasureName(schema.descriptionEn),
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
 * Canonical field names are stable camelCase identifiers. Publisher
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
