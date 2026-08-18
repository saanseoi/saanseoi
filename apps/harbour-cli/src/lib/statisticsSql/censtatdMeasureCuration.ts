import { isCancel, note, text } from '@clack/prompts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type CenstatdMeasureCurationEntry = {
  datasetCode: string
  definition: string
  name: string
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
    manifest = await promptForCenstatdMeasureCuration({
      manifest,
      measures: resolved.unresolved,
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
}) {
  const decisions = [...input.manifest.measures]
  for (const measure of input.measures) {
    note(
      `Dataset: ${measure.datasetCode}\nPublisher field: ${measure.sourceField}\nValue kind: ${measure.valueKind}`,
      'MEASURE METADATA',
    )
    const name = await requiredText('Measure name', measure.sourceField)
    const definition = await requiredText('Measure definition')
    const unitCode = await text({
      initialValue: measure.unitCode === 'publisher-unknown' ? '' : measure.unitCode,
      message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
    })
    if (isCancel(unitCode)) throw new Error('C&SD measure curation cancelled.')
    decisions.push({
      datasetCode: measure.datasetCode,
      definition,
      name,
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
    return entry as CenstatdMeasureCurationEntry
  })
  const keys = new Set(measures.map(measureKey))
  if (keys.size !== measures.length)
    throw new Error(`Duplicate C&SD measure curation entry: ${path}.`)
  return { measures, schemaVersion: 1 as const }
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
