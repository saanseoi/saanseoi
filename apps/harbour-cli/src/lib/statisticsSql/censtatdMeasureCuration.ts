import { isCancel, note, text } from '@clack/prompts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'

export type CenstatdMeasureCurationEntry = {
  datasetCode: string
  definition: string
  name: string
  schemaSpecification?: {
    sha256: string
    url: string
  }
  sourceField: string
  unitCode: string
}
export type CenstatdMeasureCurationManifest = {
  measures: CenstatdMeasureCurationEntry[]
  schemaVersion: 1
}
export type CenstatdMeasureForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}
export type CenstatdMeasureMetadata = Pick<
  CenstatdMeasureCurationEntry,
  'definition' | 'name' | 'unitCode'
>

type CenstatdSchemaMeasureCandidate = {
  definition: string
  name: string
  schemaSpecification: {
    sha256: string
    url: string
  }
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
  let resolved = resolveCenstatdMeasureCuration({ manifest, measures: input.measures })
  if (resolved.unresolved.length && input.promptForCuration) {
    const schemaCandidates = await resolveCenstatdSchemaMeasureCandidates(
      resolved.unresolved,
    )
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
                  definition: decision.definition,
                  name: decision.name,
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
  schemaCandidates?: ReadonlyMap<string, CenstatdSchemaMeasureCandidate>
}) {
  const decisions = [...input.manifest.measures]
  for (const measure of input.measures) {
    const schemaCandidate = input.schemaCandidates?.get(measureKey(measure))
    note(
      `Dataset: ${measure.datasetCode}\nPublisher field: ${measure.sourceField}\nValue kind: ${measure.valueKind}`,
      'MEASURE METADATA',
    )
    if (schemaCandidate) {
      note(
        `Name: ${schemaCandidate.name}\nDefinition: ${schemaCandidate.definition}\nSource: ${schemaCandidate.schemaSpecification.url}\nSHA-256: ${schemaCandidate.schemaSpecification.sha256}`,
        'CSDI SCHEMA CANDIDATE',
      )
    }
    const name = await requiredText(
      'Measure name',
      schemaCandidate?.name ?? measure.sourceField,
    )
    const definition = await requiredText(
      'Measure definition',
      schemaCandidate?.definition,
    )
    const unitCode = await text({
      initialValue: measure.unitCode === 'publisher-unknown' ? '' : measure.unitCode,
      message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
    })
    if (isCancel(unitCode)) throw new Error('C&SD measure curation cancelled.')
    decisions.push({
      datasetCode: measure.datasetCode,
      definition,
      name,
      ...(schemaCandidate
        ? { schemaSpecification: schemaCandidate.schemaSpecification }
        : {}),
      sourceField: measure.sourceField,
      unitCode: (unitCode ?? '').trim() || 'publisher-unknown',
    })
  }
  return { measures: decisions, schemaVersion: 1 as const }
}

export function emptyCenstatdMeasureCuration(): CenstatdMeasureCurationManifest {
  return { measures: [], schemaVersion: 1 }
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
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.measures))
    throw new Error(`Invalid C&SD measure curation manifest: ${path}.`)
  const measures = manifest.measures.map((measure, index) => {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure))
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}.`)
    const entry = measure as Partial<CenstatdMeasureCurationEntry>
    for (const field of [
      'datasetCode',
      'definition',
      'name',
      'sourceField',
      'unitCode',
    ] as const)
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new Error(`Invalid C&SD measure curation ${field}: ${path}.`)
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
  return { measures, schemaVersion: 1 as const }
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
      for (const measure of measures) {
        if (measure.datasetCode !== dataset.code) continue
        const matches = fields.filter(
          field => field.sourceField === measure.sourceField,
        )
        const descriptions = [...new Set(matches.map(field => field.description))]
        const [description] = descriptions
        const schema = fields[0]
        if (descriptions.length !== 1 || !description || !schema) continue
        candidates.set(measureKey(measure), {
          definition: description,
          name: description,
          schemaSpecification: {
            sha256: schema.sha256,
            url: specificationUrl,
          },
        })
      }
    }),
  )
  return candidates
}

type CsdiSpecificationField = {
  description: string
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
      const description = cells[3]?.trim()
      if (!sourceField || !description) continue
      fields.push({ description, sha256, sourceField })
    }
  }
  return fields
}

function staticCsdiSpecificationUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'portal.csdi.gov.hk') return null
    url.hostname = 'static.csdi.gov.hk'
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

async function requiredText(message: string, initialValue?: string) {
  const answer = await text({
    initialValue,
    message,
    validate: value => ((value ?? '').trim() ? undefined : 'Required.'),
  })
  if (isCancel(answer)) throw new Error('C&SD measure curation cancelled.')
  return (answer ?? '').trim()
}
