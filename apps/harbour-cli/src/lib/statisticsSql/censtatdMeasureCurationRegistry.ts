import { note } from '@clack/prompts'
import { validLocalisationOrigin } from './censtatdMeasureCurationLocalisation'
import { captureCurationDocuments, type CurationDocument } from '../curationDocuments'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  statsAggregations,
  statsPeriodicities,
  statsFieldComparabilityReasons,
  statsFieldComparabilityStatuses,
  statsStatisticKinds,
  computeVersionHash,
  type StatsAggregation,
  type StatsPeriodicity,
  type StatsStatisticKind,
} from '@repo/db'
import { translateAzureTexts } from '../sources/landsd/street/landsdStreetTranslation.ts'
import { formatField } from '../cli/display.ts'
import {
  DEFAULT_CURATION_DIRECTORY,
  DEFAULT_MEASURE_CURATION_DIRECTORY,
  type CenstatdFieldCurationDecision,
  type CenstatdFieldCurationEntry,
  type CenstatdFieldCurationManifest,
  type CenstatdFieldCurationRegistry,
  type CenstatdFieldForCuration,
  type CenstatdFieldLocalisation,
  type CenstatdMeasureMetadata,
  type UnitRegistryFixture,
} from './censtatdMeasureCurationTypes.ts'
import { resolveCenstatdSchemaMeasureCandidates } from './censtatdMeasureCurationSchema.ts'
import {
  promptForCenstatdFieldCuration,
  resolveCenstatdFieldCuration,
} from './censtatdMeasureCuration.ts'
import { requiredText } from './censtatdMeasureCurationValidation.ts'

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
  return captureCurationDocuments(
    resolved.metadata,
    [...new Set(input.fields.map(f => f.datasetCode))].map(datasetCode => ({
      type: 'statistic-fields',
      document: {
        schemaVersion: 8,
        datasetCode,
        fields: registry.fields
          .filter(f => f.datasetCode === datasetCode)
          .map(({ datasetCode: _dataset, ...field }) => field),
      },
    })),
  )
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

/**
 * Loads the reviewed, dimension-free measure vocabulary used by the public
 * Statistics Registry. Measure records deliberately remain separate from
 * field curation: one measure can describe many dimension-qualified fields.
 */
export async function loadCenstatdMeasureMetadata(
  directory = DEFAULT_MEASURE_CURATION_DIRECTORY,
) {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right))
  const metadata = new Map<string, CenstatdMeasureMetadata>()
  const documents: CurationDocument[] = []
  for (const path of paths) {
    const value = JSON.parse(await readFile(path, 'utf8')) as {
      datasetCode?: unknown
      measures?: unknown
      schemaVersion?: unknown
    }
    if (
      value.schemaVersion !== 1 ||
      typeof value.datasetCode !== 'string' ||
      !value.datasetCode ||
      !Array.isArray(value.measures)
    ) {
      throw new Error(`Invalid C&SD measure curation manifest: ${path}.`)
    }
    documents.push({ type: 'statistic-measures', document: value })
    for (const measure of value.measures) {
      if (!measure || typeof measure !== 'object' || Array.isArray(measure))
        throw new Error(`Invalid C&SD measure curation entry: ${path}.`)
      const entry = measure as Partial<CenstatdMeasureMetadata>
      if (
        typeof entry.measureCode !== 'string' ||
        !/^[a-z][A-Za-z0-9]*$/.test(entry.measureCode) ||
        !Array.isArray(entry.localisations) ||
        entry.localisations.length === 0
      ) {
        throw new Error(`Invalid C&SD measure curation entry: ${path}.`)
      }
      const locales = new Set<string>()
      for (const localisation of entry.localisations) {
        if (
          !localisation ||
          typeof localisation !== 'object' ||
          !['en', 'zh-Hant', 'zh-Hans'].includes(localisation.locale) ||
          typeof localisation.name !== 'string' ||
          !localisation.name.trim() ||
          typeof localisation.description !== 'string' ||
          !localisation.description.trim() ||
          typeof localisation.isTranslationVerified !== 'boolean' ||
          locales.has(localisation.locale) ||
          !validLocalisationOrigin(localisation.origin)
        ) {
          throw new Error(`Invalid C&SD measure localisation: ${path}.`)
        }
        locales.add(localisation.locale)
      }
      if (!locales.has('en'))
        throw new Error(`Missing English C&SD measure localisation: ${path}.`)
      const key = `${value.datasetCode}\u0000${entry.measureCode}`
      if (metadata.has(key))
        throw new Error(`Duplicate C&SD measure curation entry: ${path}.`)
      metadata.set(key, {
        localisations: entry.localisations as CenstatdFieldLocalisation[],
        measureCode: entry.measureCode,
      })
    }
  }
  return captureCurationDocuments(metadata, documents)
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
export async function ensureCenstatdUnit(input: { code: string; path: string }) {
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

export function emptyCenstatdFieldCuration(): CenstatdFieldCurationRegistry {
  return { fields: [] }
}

export function measureKey(
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
    if (
      entry.periodicity !== undefined &&
      !statsPeriodicities.includes(entry.periodicity as StatsPeriodicity)
    ) {
      throw new Error(`Invalid C&SD periodicity: ${path}.`)
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
        locales.has(localisation.locale) ||
        !validLocalisationOrigin(localisation.origin)
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
        !statsFieldComparabilityStatuses.includes(comparability.status) ||
        !statsFieldComparabilityReasons.includes(comparability.reason) ||
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
