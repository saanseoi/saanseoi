import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { LandsdStreetBaselineCandidate } from './landsdStreetCuration.ts'
import type { LandsdStreetRecord } from './landsdStreetIngestTypes.ts'

export type LandsdStreetBaselineRegistry = {
  baselineSha256: string
  records: LandsdStreetBaselineCandidate[]
  sourceVersion: string
  version: 1
}

export async function loadLandsdStreetBaselineRegistry(path: string) {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw new Error(
      `Cannot read LandsD street baseline registry at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return validateLandsdStreetBaselineRegistry(value, path)
}

export async function writeLandsdStreetBaselineRegistry(
  path: string,
  registry: LandsdStreetBaselineRegistry,
) {
  validateLandsdStreetBaselineRegistry(registry, path)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
}

export function createLandsdStreetBaselineRegistry(input: {
  baselineSha256: string
  records: readonly LandsdStreetRecord[]
  sourceVersion: string
}): LandsdStreetBaselineRegistry {
  const records = input.records
    .filter(record => record.sourceKind === 'baseline')
    .map(record => {
      const en = record.i18n.find(item => item.locale === 'en')?.name
      const zhHant = record.i18n.find(item => item.locale === 'zh-Hant')?.name
      if (!record.streetId || !en || !zhHant) {
        throw new Error(
          `LandsD baseline ${record.recordKey} needs a canonical street ID and both publisher names before it can enter the identity registry.`,
        )
      }
      return {
        districtCodes: [...record.districtCodes],
        names: { en, zhHant },
        recordKey: record.recordKey,
        streetId: record.streetId,
      } satisfies LandsdStreetBaselineCandidate
    })
    .sort((left, right) => left.recordKey.localeCompare(right.recordKey))
  return validateLandsdStreetBaselineRegistry(
    {
      baselineSha256: input.baselineSha256,
      records,
      sourceVersion: input.sourceVersion,
      version: 1,
    },
    'generated LandsD street baseline registry',
  )
}

export function mergeLandsdStreetBaselineCandidates(
  registry: LandsdStreetBaselineRegistry | null,
  staged: readonly LandsdStreetBaselineCandidate[],
) {
  const byRecordKey = new Map(staged.map(candidate => [candidate.recordKey, candidate]))
  for (const candidate of registry?.records ?? []) {
    const previous = byRecordKey.get(candidate.recordKey)
    if (previous && previous.streetId !== candidate.streetId) {
      throw new Error(
        `Staged LandsD baseline ${candidate.recordKey} uses ${previous.streetId}, but the checked-in identity registry uses ${candidate.streetId}.`,
      )
    }
    byRecordKey.set(candidate.recordKey, candidate)
  }
  return [...byRecordKey.values()]
}

export function sameLandsdStreetBaselineRegistry(
  left: LandsdStreetBaselineRegistry | null,
  right: LandsdStreetBaselineRegistry,
) {
  return left !== null && JSON.stringify(left) === JSON.stringify(right)
}

export function validateLandsdStreetCurrentRelease(input: {
  records: readonly LandsdStreetRecord[]
  registry: LandsdStreetBaselineRegistry
  sourceVersion: string
}) {
  if (input.sourceVersion !== input.registry.sourceVersion) {
    throw new Error(
      `Current LandsD street release ${input.sourceVersion} does not match baseline registry ${input.registry.sourceVersion}.`,
    )
  }
  if (input.records.length === 0) {
    throw new Error('The current LandsD street release contains no baseline names.')
  }
  const registryByRecordKey = new Map(
    input.registry.records.map(record => [record.recordKey, record]),
  )
  const recordKeys = new Set<string>()
  const streetIds = new Set<string>()
  for (const record of input.records) {
    if (
      record.sourceKind !== 'baseline' ||
      record.deferToNotices ||
      record.application !== null ||
      record.noticeType !== null ||
      record.noticeRef !== null ||
      record.gazetteDate !== null ||
      record.effectiveDate !== null
    ) {
      throw new Error(
        `Current LandsD release record ${record.recordKey} is not a baseline-only name.`,
      )
    }
    const registered = registryByRecordKey.get(record.recordKey)
    if (!record.streetId || registered?.streetId !== record.streetId) {
      throw new Error(
        `Current LandsD release record ${record.recordKey} has no matching registered canonical ID.`,
      )
    }
    if (recordKeys.has(record.recordKey) || streetIds.has(record.streetId)) {
      throw new Error(
        `Current LandsD release repeats source record or canonical ID ${record.recordKey}.`,
      )
    }
    recordKeys.add(record.recordKey)
    streetIds.add(record.streetId)
    if (
      !record.i18n.some(item => item.locale === 'en' && item.name.trim()) ||
      !record.i18n.some(item => item.locale === 'zh-Hant' && item.name.trim())
    ) {
      throw new Error(
        `Current LandsD release record ${record.recordKey} needs both publisher names.`,
      )
    }
    const baselineEvidence = record.evidenceAssets.filter(
      asset => asset.role === 'sourcePdf',
    )
    if (
      baselineEvidence.length !== 1 ||
      baselineEvidence[0]?.contentHash !== input.registry.baselineSha256
    ) {
      throw new Error(
        `Current LandsD release record ${record.recordKey} does not reference the registered baseline PDF.`,
      )
    }
  }
  if (recordKeys.size !== registryByRecordKey.size) {
    throw new Error(
      `Current LandsD release has ${recordKeys.size} names, but its baseline registry has ${registryByRecordKey.size}.`,
    )
  }
}

function validateLandsdStreetBaselineRegistry(
  value: unknown,
  path: string,
): LandsdStreetBaselineRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`)
  }
  const registry = value as Partial<LandsdStreetBaselineRegistry>
  if (
    registry.version !== 1 ||
    typeof registry.baselineSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(registry.baselineSha256) ||
    typeof registry.sourceVersion !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(registry.sourceVersion) ||
    !Array.isArray(registry.records)
  ) {
    throw new Error(`${path} is not a valid LandsD street baseline registry.`)
  }
  const recordKeys = new Set<string>()
  const streetIds = new Set<string>()
  for (const [index, candidate] of registry.records.entries()) {
    if (
      !candidate ||
      typeof candidate.recordKey !== 'string' ||
      typeof candidate.streetId !== 'string' ||
      !Array.isArray(candidate.districtCodes) ||
      candidate.districtCodes.some(code => typeof code !== 'string') ||
      typeof candidate.names?.en !== 'string' ||
      typeof candidate.names?.zhHant !== 'string'
    ) {
      throw new Error(`${path}.records[${index}] is invalid.`)
    }
    if (recordKeys.has(candidate.recordKey)) {
      throw new Error(`${path} repeats source record ${candidate.recordKey}.`)
    }
    if (streetIds.has(candidate.streetId)) {
      throw new Error(`${path} repeats canonical street ID ${candidate.streetId}.`)
    }
    recordKeys.add(candidate.recordKey)
    streetIds.add(candidate.streetId)
  }
  return registry as LandsdStreetBaselineRegistry
}
