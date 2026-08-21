import { confirm, isCancel, note, select, text } from '@clack/prompts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  statsAggregations,
  statsStatisticKinds,
  computeVersionHash,
  type StatsAggregation,
  type StatsFieldComparability,
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

export type CenstatdFieldCurationEntry = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  aggregationPercentile?: number
  comparability?: StatsFieldComparability
  denominatorFieldName?: string | null
  dimensions: Readonly<Record<string, string>>
  localisations: readonly CenstatdFieldLocalisation[]
  /** The dimension-free statistic represented by this source-field mapping. */
  measureCode: string
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  fieldName: string
  schemaSpecification?: {
    sha256: string
    url: string
  }
  sourceNullOption?: string | null
  sourceField: string
  unitCode: string
}
export type CenstatdFieldCurationManifest = {
  datasetCode: string
  fields: CenstatdFieldCurationEntry[]
  schemaVersion: 8
}
type CenstatdFieldCurationDecision = CenstatdFieldCurationEntry & {
  datasetCode: string
}
type CenstatdFieldCurationRegistry = {
  fields: CenstatdFieldCurationDecision[]
}
export type CenstatdFieldForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}
export type CenstatdFieldMetadata = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  aggregationPercentile?: number
  comparability?: StatsFieldComparability
  denominatorFieldName?: string | null
  dimensions: Readonly<Record<string, string>>
  localisations: readonly CenstatdFieldLocalisation[]
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  fieldName: string
  sourceNullOption?: string | null
  unitCode: string
}

export type CenstatdFieldLocalisation = {
  description: string
  isTranslationVerified: boolean
  locale: 'en' | 'zh-Hans' | 'zh-Hant'
  name: string
}

type CenstatdSchemaMeasureCandidate = {
  localisations: readonly CenstatdFieldLocalisation[]
  fieldName: string
  sourceReleaseUrl: string
  schemaSpecification: {
    sha256: string
    url: string
  }
  sourceNullOption: string
}

const DEFAULT_CURATION_DIRECTORY = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics',
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

export async function resolveCenstatdFieldMetadata(input: {
  fields: readonly CenstatdFieldForCuration[]
  promptForCuration: boolean
}) {
  let registry = await loadCenstatdFieldCuration(DEFAULT_CURATION_DIRECTORY)
  const schemaCandidates = await resolveCenstatdSchemaMeasureCandidates(input.fields)
  let resolved = resolveCenstatdFieldCuration({
    registry,
    fields: input.fields,
  })
  if (resolved.unresolved.length && input.promptForCuration) {
    registry = await promptForCenstatdFieldCuration({
      registry,
      fields: resolved.unresolved,
      persist: registry =>
        saveCenstatdFieldCuration(DEFAULT_CURATION_DIRECTORY, registry),
      schemaCandidates,
    })
    resolved = resolveCenstatdFieldCuration({ registry, fields: input.fields })
  }
  if (resolved.unresolved.length) {
    throw new Error(
      `C&SD field metadata requires curation for ${resolved.unresolved.map(field => `${field.datasetCode}/${field.sourceField}`).join(', ')}. Rerun without --yes to review the fields.`,
    )
  }
  return resolved.metadata
}

export async function loadCenstatdFieldCuration(
  directory = DEFAULT_CURATION_DIRECTORY,
) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const paths = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => resolve(directory, entry.name))
      .sort((left, right) => left.localeCompare(right))
    const manifests = await Promise.all(
      paths.map(async path =>
        parseCenstatdFieldCuration(JSON.parse(await readFile(path, 'utf8')), path),
      ),
    )
    const datasetCodes = new Set(manifests.map(manifest => manifest.datasetCode))
    if (datasetCodes.size !== manifests.length)
      throw new Error(`Duplicate C&SD field curation dataset: ${directory}.`)
    return {
      fields: manifests.flatMap(({ datasetCode, fields }) =>
        fields.map(field => ({ ...field, datasetCode })),
      ),
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return emptyCenstatdFieldCuration()
    throw error
  }
}

export async function saveCenstatdFieldCuration(
  directory: string,
  registry: CenstatdFieldCurationRegistry,
) {
  const checked = validateCenstatdFieldCurationRegistry(registry, directory)
  await mkdir(directory, { recursive: true })
  const byDataset = new Map<string, CenstatdFieldCurationDecision[]>()
  for (const field of checked.fields) {
    const fields = byDataset.get(field.datasetCode) ?? []
    fields.push(field)
    byDataset.set(field.datasetCode, fields)
  }
  const filenames = new Set<string>()
  await Promise.all(
    [...byDataset.entries()].map(async ([datasetCode, fields]) => {
      const filename = curationDatasetFilename(datasetCode)
      filenames.add(filename)
      await writeFile(
        resolve(directory, filename),
        `${JSON.stringify(
          {
            datasetCode,
            fields: fields.map(({ datasetCode: _, ...field }) => field),
            schemaVersion: 8,
          },
          null,
          2,
        )}\n`,
        'utf8',
      )
    }),
  )
  const existing = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    existing
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .filter(entry => !filenames.has(entry.name))
      .map(entry => rm(resolve(directory, entry.name))),
  )
}

function curationDatasetFilename(datasetCode: string) {
  const prefix = 'ds-hk-hkgov-censtatd-division-statistic-'
  return `${datasetCode.startsWith(prefix) ? datasetCode.slice(prefix.length) : datasetCode}.json`
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

export function resolveCenstatdFieldCuration(input: {
  registry: CenstatdFieldCurationRegistry
  fields: readonly CenstatdFieldForCuration[]
}) {
  const decisions = new Map(
    input.registry.fields.map(item => [measureKey(item), item] as const),
  )
  const unresolved = input.fields.filter(field => !decisions.has(measureKey(field)))
  return {
    metadata: new Map(
      input.fields.flatMap(field => {
        const decision = decisions.get(measureKey(field))
        return decision
          ? [
              [
                measureKey(field),
                {
                  aggregation: decision.aggregation,
                  ...(decision.aggregationPercentile === undefined
                    ? {}
                    : { aggregationPercentile: decision.aggregationPercentile }),
                  ...(decision.comparability === undefined
                    ? {}
                    : { comparability: decision.comparability }),
                  ...(decision.denominatorFieldName === undefined
                    ? {}
                    : { denominatorFieldName: decision.denominatorFieldName }),
                  dimensions: decision.dimensions,
                  localisations: decision.localisations,
                  fieldName: decision.fieldName,
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

export async function promptForCenstatdFieldCuration(input: {
  registry: CenstatdFieldCurationRegistry
  fields: readonly CenstatdFieldForCuration[]
  persist?: (registry: CenstatdFieldCurationRegistry) => Promise<void>
  schemaCandidates: ReadonlyMap<string, CenstatdSchemaMeasureCandidate>
}) {
  const decisions = [...input.registry.fields]
  const persist = () => input.persist?.({ fields: decisions }) ?? Promise.resolve()
  for (const field of input.fields) {
    const schemaCandidate = input.schemaCandidates.get(measureKey(field))
    note(
      formatCenstatdFieldReviewContext({ field, schemaCandidate }),
      'MEASURE METADATA',
    )

    let fieldName: string | null = null
    let localisations: readonly CenstatdFieldLocalisation[] | null = null
    let acceptedSchemaCandidate = false
    if (schemaCandidate) {
      note(
        formatCenstatdFieldProposal({
          candidate: schemaCandidate,
          sourceField: field.sourceField,
          suggestedUnitCode: suggestUnitCode(schemaCandidate.fieldName, decisions),
        }),
        'PROPOSALS',
      )
      const accepted = await confirm({
        initialValue: true,
        message: 'Accept the proposed CSDI field name and description?',
      })
      if (isCancel(accepted)) throw new Error('C&SD field curation cancelled.')
      if (accepted) {
        acceptedSchemaCandidate = true
        fieldName = schemaCandidate.fieldName
        localisations = schemaCandidate.localisations
      }
    }

    if (!fieldName || !localisations) {
      fieldName = await requiredFieldName(
        'Canonical field key',
        schemaCandidate?.fieldName ?? suggestMeasureName(field.sourceField),
      )
      const englishName = await requiredText(
        'English field name',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.name ??
          suggestMeasureName(field.sourceField),
      )
      const englishDescription = await requiredText(
        'English field description',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.description,
      )
      const chineseProposals = await resolveChineseLocalisationProposals({
        candidate: schemaCandidate,
        englishDescription,
        englishName,
      })
      const traditionalChineseName = await requiredText(
        'Traditional Chinese field name',
        chineseProposals.zhHant?.name,
      )
      const traditionalChineseDescription = await requiredText(
        'Traditional Chinese field description',
        chineseProposals.zhHant?.description,
      )
      const simplifiedChineseName = await requiredText(
        'Simplified Chinese field name',
        chineseProposals.zhHans?.name,
      )
      const simplifiedChineseDescription = await requiredText(
        'Simplified Chinese field description',
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

    const suggestedUnitCode = suggestUnitCode(fieldName, decisions)
    const measureCode = await requiredFieldName('Canonical measure code', fieldName)
    const seriesMetadata = suggestSeriesFieldMetadata({
      decisions,
      localisations,
    })
    const statisticKind = await selectStatisticKind({
      localisations,
      field,
      fieldName,
      suggestedStatisticKind: seriesMetadata.statisticKind,
      suggestedUnitCode,
    })
    const aggregation = await selectAggregation({
      statisticKind,
      suggestedAggregation:
        seriesMetadata.aggregation ?? suggestAggregation(localisations),
    })
    const aggregationPercentile = await selectAggregationPercentile({
      aggregation,
      suggestedAggregationPercentile:
        seriesMetadata.aggregationPercentile ??
        suggestAggregationPercentile(localisations),
    })
    const denominatorFieldName = await optionalDenominatorFieldName({
      statisticKind,
      suggestedDenominatorFieldName: seriesMetadata.denominatorFieldName,
    })
    const resolvedUnitCode = acceptedSchemaCandidate
      ? (suggestedUnitCode ?? field.unitCode)
      : await promptForCenstatdUnitCode(field.unitCode, suggestedUnitCode)
    await ensureCenstatdUnit({ code: resolvedUnitCode, path: DEFAULT_UNITS_PATH })
    decisions.push({
      aggregation,
      ...(aggregationPercentile === undefined ? {} : { aggregationPercentile }),
      datasetCode: field.datasetCode,
      ...(denominatorFieldName ? { denominatorFieldName } : {}),
      dimensions: {},
      localisations,
      fieldName,
      measureCode,
      ...(schemaCandidate
        ? {
            schemaSpecification: schemaCandidate.schemaSpecification,
            sourceNullOption: schemaCandidate.sourceNullOption,
          }
        : {}),
      sourceField: field.sourceField,
      statisticKind,
      unitCode: resolvedUnitCode,
    })
    await persist()
  }
  return { fields: decisions }
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
  if (isCancel(unitCode)) throw new Error('C&SD field curation cancelled.')
  return (unitCode ?? '').trim() || 'publisher-unknown'
}

/** Gives enough semantic context to review a field before choosing its kind. */
export function formatCenstatdFieldReviewContext(input: {
  field: CenstatdFieldForCuration
  schemaCandidate?: Pick<
    CenstatdSchemaMeasureCandidate,
    'localisations' | 'sourceReleaseUrl'
  >
}) {
  const proposed = schemaCandidateLocalisation(input.schemaCandidate, 'en')
  return [
    formatField('dataset', input.field.datasetCode),
    formatField(
      'proposed name',
      proposed?.name ?? suggestMeasureName(input.field.sourceField),
    ),
    ...(proposed?.description
      ? [formatField('proposed description', proposed.description)]
      : []),
    formatField('value kind', input.field.valueKind),
    ...(input.schemaCandidate
      ? [formatField('source release', input.schemaCandidate.sourceReleaseUrl)]
      : []),
  ].join('\n')
}

export function emptyCenstatdFieldCuration(): CenstatdFieldCurationRegistry {
  return { fields: [] }
}

function measureKey(
  field: Pick<CenstatdFieldForCuration, 'datasetCode' | 'sourceField'>,
) {
  return `${field.datasetCode}\u0000${field.sourceField}`
}

export function parseCenstatdFieldCuration(value: unknown, path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid C&SD field curation manifest: ${path}.`)
  const manifest = value as Partial<CenstatdFieldCurationManifest>
  if (
    manifest.schemaVersion !== 8 ||
    typeof manifest.datasetCode !== 'string' ||
    !manifest.datasetCode.trim() ||
    !Array.isArray(manifest.fields)
  ) {
    throw new Error(`Invalid C&SD field curation manifest: ${path}.`)
  }
  const fields = manifest.fields.map((field, index) => {
    if (!field || typeof field !== 'object' || Array.isArray(field))
      throw new Error(`Invalid C&SD field curation entry ${index + 1}: ${path}.`)
    const entry = field as Partial<CenstatdFieldCurationEntry>
    if ('datasetCode' in entry)
      throw new Error(`C&SD dataset code belongs in the manifest root: ${path}.`)
    for (const field of ['sourceField', 'unitCode'] as const)
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new Error(`Invalid C&SD field curation ${field}: ${path}.`)
    if (
      typeof entry.fieldName !== 'string' ||
      !/^[a-z][A-Za-z0-9]*$/.test(entry.fieldName)
    ) {
      throw new Error(`Invalid C&SD canonical field key: ${path}.`)
    }
    if (
      typeof entry.measureCode !== 'string' ||
      !/^[a-z][A-Za-z0-9]*$/.test(entry.measureCode)
    ) {
      throw new Error(`Invalid C&SD measure code: ${path}.`)
    }
    if (
      !entry.dimensions ||
      typeof entry.dimensions !== 'object' ||
      Array.isArray(entry.dimensions) ||
      Object.entries(entry.dimensions).some(
        ([code, value]) =>
          !/^[a-z][a-z0-9-]*$/.test(code) || typeof value !== 'string' || !value.trim(),
      )
    ) {
      throw new Error(`Invalid C&SD analytical dimensions: ${path}.`)
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
    if (entry.aggregation === 'median' || entry.aggregation === 'percentile') {
      if (
        typeof entry.aggregationPercentile !== 'number' ||
        !Number.isFinite(entry.aggregationPercentile) ||
        entry.aggregationPercentile < 0 ||
        entry.aggregationPercentile > 100 ||
        (entry.aggregation === 'median' && entry.aggregationPercentile !== 50)
      ) {
        throw new Error(`Invalid C&SD aggregation percentile: ${path}.`)
      }
    } else if (entry.aggregationPercentile !== undefined) {
      throw new Error(`Unexpected C&SD aggregation percentile: ${path}.`)
    }
    if (!Array.isArray(entry.localisations) || entry.localisations.length === 0)
      throw new Error(`Missing C&SD field localisations: ${path}.`)
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
        throw new Error(`Invalid C&SD field localisation: ${path}.`)
      }
      locales.add(localisation.locale)
    }
    if (!locales.has('en'))
      throw new Error(`Missing English C&SD field localisation: ${path}.`)
    if (
      entry.sourceNullOption !== undefined &&
      entry.sourceNullOption !== null &&
      typeof entry.sourceNullOption !== 'string'
    ) {
      throw new Error(`Invalid C&SD field source null option: ${path}.`)
    }
    if (
      entry.denominatorFieldName !== undefined &&
      entry.denominatorFieldName !== null &&
      (typeof entry.denominatorFieldName !== 'string' ||
        !/^[a-z][A-Za-z0-9]*$/.test(entry.denominatorFieldName))
    )
      throw new Error(`Invalid C&SD denominator field key: ${path}.`)
    if (entry.comparability !== undefined) {
      const comparability = entry.comparability
      if (
        !comparability ||
        typeof comparability !== 'object' ||
        Array.isArray(comparability) ||
        Object.keys(comparability).sort().join(',') !==
          'affectedReferencePeriods,reason,status' ||
        comparability.status !== 'caution' ||
        comparability.reason !== 'economic-activity-status-classification-changed' ||
        !Array.isArray(comparability.affectedReferencePeriods) ||
        comparability.affectedReferencePeriods.length === 0 ||
        comparability.affectedReferencePeriods.some(
          period => typeof period !== 'string' || !/^\d{4}$/.test(period),
        ) ||
        new Set(comparability.affectedReferencePeriods).size !==
          comparability.affectedReferencePeriods.length
      ) {
        throw new Error(`Invalid C&SD field comparability: ${path}.`)
      }
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
        throw new Error(`Invalid C&SD field schema specification: ${path}.`)
      }
    }
    return entry as CenstatdFieldCurationEntry
  })
  const keys = new Set(fields.map(field => field.sourceField))
  if (keys.size !== fields.length)
    throw new Error(`Duplicate C&SD field curation entry: ${path}.`)
  const fieldNames = new Set(fields.map(field => field.fieldName))
  if (fieldNames.size !== fields.length)
    throw new Error(`Duplicate C&SD canonical field key: ${path}.`)
  const localisedMeasureNames = new Map<string, CenstatdFieldCurationEntry>()
  for (const field of fields) {
    for (const localisation of field.localisations) {
      const key = `${localisation.locale}\u0000${localisation.name.trim()}`
      const existing = localisedMeasureNames.get(key)
      if (existing) {
        throw new Error(
          `Duplicate C&SD localised field name for ${manifest.datasetCode}/${localisation.locale}: ${localisation.name} (${existing.sourceField}, ${field.sourceField}): ${path}.`,
        )
      }
      localisedMeasureNames.set(key, field)
    }
  }
  return {
    datasetCode: manifest.datasetCode,
    fields,
    schemaVersion: 8 as const,
  }
}

function validateCenstatdFieldCurationRegistry(
  registry: CenstatdFieldCurationRegistry,
  path: string,
) {
  const byDataset = new Map<string, CenstatdFieldCurationDecision[]>()
  for (const decision of registry.fields) {
    const fields = byDataset.get(decision.datasetCode) ?? []
    fields.push(decision)
    byDataset.set(decision.datasetCode, fields)
  }
  for (const [datasetCode, fields] of byDataset)
    parseCenstatdFieldCuration(
      {
        datasetCode,
        fields: fields.map(({ datasetCode: _, ...field }) => field),
        schemaVersion: 8,
      },
      path,
    )
  return registry
}

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

export function formatCenstatdFieldProposal(input: {
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations' | 'fieldName'>
  sourceField: string
  suggestedUnitCode: string | null
}) {
  const english = schemaCandidateLocalisation(input.candidate, 'en')
  const zhHant = schemaCandidateLocalisation(input.candidate, 'zh-Hant')
  const zhHans = schemaCandidateLocalisation(input.candidate, 'zh-Hans')
  if (!english || !zhHant || !zhHans)
    throw new Error('C&SD proposal is missing a required localisation.')
  return [
    `${colorRed(input.sourceField)}${colorTeal(' -> ')}${colorYellow(input.candidate.fieldName)}${input.suggestedUnitCode ? colorGrey(` (${input.suggestedUnitCode})`) : ''}`,
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
  fieldName: string,
  reviewedMeasures: readonly Pick<
    CenstatdFieldCurationEntry,
    'fieldName' | 'unitCode'
  >[],
) {
  const measureTokens = canonicalMeasureTokens(fieldName)
  const candidates = reviewedMeasures
    .filter(entry => entry.unitCode !== 'publisher-unknown')
    .filter(entry => measureTokens.has('density') || !entry.unitCode.includes('-per-'))
    .map(entry => ({
      entry,
      score: intersectionSize(measureTokens, canonicalMeasureTokens(entry.fieldName)),
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
  localisations?: readonly CenstatdFieldLocalisation[]
  fieldName: string
  unitCode: string | null
}): Exclude<StatsStatisticKind, 'unreviewed'> {
  const english = input.localisations?.find(
    localisation => localisation.locale === 'en',
  )
  const proposedText = `${english?.name ?? ''} ${english?.description ?? ''}`
  const proposedKind = suggestStatisticKindFromText(proposedText)
  if (proposedKind) return proposedKind

  const name = input.fieldName.toLocaleLowerCase('en')
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

export function suggestSeriesFieldMetadata(input: {
  decisions: readonly CenstatdFieldCurationEntry[]
  localisations: readonly CenstatdFieldLocalisation[]
}): {
  aggregation: Exclude<StatsAggregation, 'unreviewed'> | null
  aggregationPercentile: number | null
  denominatorFieldName: string | null
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'> | null
} {
  const signature = measureSeriesSignature(input.localisations)
  if (!signature)
    return {
      aggregation: null,
      aggregationPercentile: null,
      denominatorFieldName: null,
      statisticKind: null,
    }
  const peers = input.decisions.filter(
    decision => measureSeriesSignature(decision.localisations) === signature,
  )
  return {
    aggregation: uniqueSuggestion(peers.map(peer => peer.aggregation)),
    aggregationPercentile: uniqueSuggestion(
      peers.map(peer => peer.aggregationPercentile ?? null),
    ),
    denominatorFieldName: uniqueSuggestion(
      peers.map(peer => peer.denominatorFieldName ?? null),
    ),
    statisticKind: uniqueSuggestion(peers.map(peer => peer.statisticKind)),
  }
}

function measureSeriesSignature(localisations: readonly CenstatdFieldLocalisation[]) {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null
  return english.description
    .toLocaleLowerCase('en')
    .replace(
      /\baged?\s+(?:under\s+)?\d+(?:\s*(?:-|to)\s*\d+)?(?:\s+and\s+over)?\b/g,
      'age-group',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueSuggestion<T>(values: readonly T[]): T | null {
  const distinct = new Set(values)
  return distinct.size === 1 ? (distinct.values().next().value ?? null) : null
}

function suggestStatisticKindFromText(
  text: string,
): Exclude<StatsStatisticKind, 'unreviewed'> | null {
  if (/\b(?:percent|percentage|proportion|share)\b/i.test(text)) return 'proportion'
  if (/\bratio\b/i.test(text)) return 'ratio'
  if (/\bdensity\b/i.test(text)) return 'density'
  if (/\brate\b/i.test(text)) return 'rate'
  if (/\bindex\b/i.test(text)) return 'index'
  if (/\b(?:count|population|number|total)\b/i.test(text)) return 'count'
  return null
}

async function selectStatisticKind(input: {
  localisations: readonly CenstatdFieldLocalisation[]
  field: CenstatdFieldForCuration
  fieldName: string
  suggestedStatisticKind: Exclude<StatsStatisticKind, 'unreviewed'> | null
  suggestedUnitCode: string | null
}): Promise<Exclude<StatsStatisticKind, 'unreviewed'>> {
  const value = await select({
    initialValue:
      input.suggestedStatisticKind ??
      suggestStatisticKind({
        localisations: input.localisations,
        fieldName: input.fieldName,
        unitCode: input.suggestedUnitCode ?? input.field.unitCode,
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
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  return value as Exclude<StatsStatisticKind, 'unreviewed'>
}

/**
 * Suggests an aggregation explicitly named in the publisher's proposed English
 * semantic text. This is deliberately separate from statistic-kind inference:
 * a quantity can be a total, mean, or median.
 */
export function suggestAggregation(
  localisations: readonly CenstatdFieldLocalisation[],
): Exclude<StatsAggregation, 'unreviewed'> | null {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null

  const text = `${english.name} ${english.description}`
  const aggregationTerms: ReadonlyArray<
    readonly [RegExp, Exclude<StatsAggregation, 'unreviewed'>]
  > = [
    [/\b(?:first|lower|third|upper)\s+quartile\b/i, 'percentile'],
    [/\bmedian\b/i, 'median'],
    [/\b(?:mean|average)\b/i, 'mean'],
    [/\b(?:minimum|min)\b/i, 'minimum'],
    [/\b(?:maximum|max)\b/i, 'maximum'],
    [/\b(?:total|sum)\b/i, 'total'],
    [/\bpercentile\b/i, 'percentile'],
  ]
  return aggregationTerms.find(([term]) => term.test(text))?.[1] ?? null
}

export function suggestAggregationPercentile(
  localisations: readonly CenstatdFieldLocalisation[],
) {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null
  const text = `${english.name} ${english.description}`
  if (/\bmedian\b/i.test(text)) return 50
  if (/\b(?:first|lower)\s+quartile\b/i.test(text)) return 25
  if (/\b(?:third|upper)\s+quartile\b/i.test(text)) return 75
  return null
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
 * Totals preserve additive count and quantity fields only. Summing a ratio,
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
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  return value as Exclude<StatsAggregation, 'unreviewed'>
}

async function selectAggregationPercentile(input: {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  suggestedAggregationPercentile: number | null
}): Promise<number | undefined> {
  if (input.aggregation === 'median') return 50
  if (input.aggregation !== 'percentile') return undefined
  const value = await text({
    initialValue: input.suggestedAggregationPercentile?.toString(),
    message: 'Percentile rank (0–100)',
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  const percentileText = value.trim()
  const percentile = Number(percentileText)
  if (
    !percentileText ||
    !Number.isFinite(percentile) ||
    percentile < 0 ||
    percentile > 100
  ) {
    throw new Error('C&SD percentile rank must be a number from 0 to 100.')
  }
  return percentile
}

async function optionalDenominatorFieldName(input: {
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  suggestedDenominatorFieldName: string | null
}) {
  if (!['proportion', 'ratio', 'rate', 'density'].includes(input.statisticKind))
    return undefined
  const value = await text({
    initialValue: input.suggestedDenominatorFieldName ?? undefined,
    message: 'Canonical denominator field key (leave blank when the base is external)',
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  const denominatorFieldName = value.trim()
  if (!denominatorFieldName) return undefined
  if (!/^[a-z][A-Za-z0-9]*$/.test(denominatorFieldName))
    throw new Error('C&SD denominator field key must be lower camel case.')
  return denominatorFieldName
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
  locale: CenstatdFieldLocalisation['locale'],
) {
  return candidate?.localisations.find(localisation => localisation.locale === locale)
}

function machineLocalisation(
  translated: ReadonlyMap<string, string>,
  englishName: string,
  englishDescription: string,
  locale: CenstatdFieldLocalisation['locale'],
): CenstatdFieldLocalisation {
  const name = translated.get(englishName)
  const description = translated.get(englishDescription)
  if (!name || !description)
    throw new Error(`Azure Translator returned an incomplete ${locale} field proposal.`)
  return { description, isTranslationVerified: false, locale, name }
}

function isLocalisationVerified(
  proposal: CenstatdFieldLocalisation | null,
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

async function requiredFieldName(message: string, initialValue: string) {
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
  if (isCancel(answer)) throw new Error('C&SD field curation cancelled.')
  return (answer ?? '').trim()
}
