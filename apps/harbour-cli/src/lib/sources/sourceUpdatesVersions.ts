import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { REPO_ROOT } from './sourceUpdatesConfig.ts'
import type {
  DatasetFixture,
  DatasetUpdate,
  UpdateState,
} from './sourceUpdatesTypes.ts'

export async function readLatestLocalSourceVersion(
  datasetCode: string,
  sourceVersion?: string,
) {
  const releaseRoot = resolve(REPO_ROOT, 'fixtures/meta/releases', datasetCode)
  let entries: Array<{ isFile(): boolean; name: string }>
  try {
    entries = await readdir(releaseRoot, { withFileTypes: true })
  } catch {
    return undefined
  }

  const versions = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(async entry => {
        const content = await readFile(resolve(releaseRoot, entry.name), 'utf8')
        return content.match(/^sourceVersion:\s*["']([^"']+)["']/m)?.[1]
      }),
  )
  const filteredVersions = sourceVersion
    ? versions.filter(
        version =>
          version === sourceVersion || version?.startsWith(`${sourceVersion}.`),
      )
    : versions
  return filteredVersions
    .filter((version): version is string => Boolean(version))
    .sort(compareVersions)
    .at(-1)
}

export function resolveDatasetStatus(input: {
  dataset: DatasetFixture
  version: string
  localVersion: string | undefined
  previous: UpdateState[string] | undefined
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
}): DatasetUpdate['status'] {
  const previousReleaseRevision =
    input.previous?.releaseLastRevisedAt ?? input.dataset.releaseLastRevisedAt
  if (
    input.dataset.releasePolicy?.revisionScope !== 'none' &&
    input.releaseLastRevisedAt &&
    previousReleaseRevision &&
    input.releaseLastRevisedAt !== previousReleaseRevision
  ) {
    return 'new'
  }

  const status = resolveReleaseStatus(input.version, input.localVersion, input.previous)
  const previousMetadataRevision =
    input.previous?.metadataLastRevisedAt ?? input.dataset.metadataLastRevisedAt
  if (
    status === 'current' &&
    input.metadataLastRevisedAt &&
    previousMetadataRevision &&
    input.metadataLastRevisedAt !== previousMetadataRevision
  ) {
    return 'review'
  }
  return status
}

function resolveReleaseStatus(
  version: string,
  localVersion: string | undefined,
  previous: UpdateState[string] | undefined,
): DatasetUpdate['status'] {
  const previousVersion = previous?.versionKey?.startsWith('sha256:')
    ? undefined
    : previous?.versionKey
  const baseline = previousVersion ?? localVersion
  if (!baseline) return 'new'
  return compareVersions(baseline, version) >= 0 ? 'current' : 'new'
}

export function compareVersions(left: string, right: string) {
  return normaliseComparableVersion(left).localeCompare(
    normaliseComparableVersion(right),
    undefined,
    { numeric: true },
  )
}

function normaliseComparableVersion(value: string) {
  return /^\d{4}$/.test(value) ? `${value}.0` : value
}

export function normaliseDatasetVersion(dataset: DatasetFixture, value: string) {
  if (
    dataset.versionPolicy.correctionSuffixSource === 'generated' &&
    ((dataset.versionPolicy.scheme === 'reference-year' && /^\d{4}$/.test(value)) ||
      (['initial-release-date', 'reference-date', 'release-date'].includes(
        dataset.versionPolicy.scheme,
      ) &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      (dataset.versionPolicy.scheme === 'quarterly' &&
        (/^\d{4}-Q[1-4]$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value))))
  ) {
    if (dataset.versionPolicy.scheme === 'quarterly') {
      const match = value.match(/^(\d{4})-(?:Q([1-4])|(\d{2})-\d{2})$/)
      if (!match) return value
      const year = match[1] as string
      const quarter = match[2] ?? String(Math.ceil(Number(match[3]) / 3))
      return `${year}-Q${quarter}.0`
    }
    return `${value}.0`
  }
  return value
}

export function quarterlyVersionBase(value: string) {
  return value.replace(/\.\d+$/, '')
}

export function resolveDatasetVersion(
  dataset: DatasetFixture,
  discoveredVersion: string | undefined,
  previous: UpdateState[string] | undefined,
  releaseLastRevisedAt?: string,
) {
  const policy = dataset.versionPolicy
  if (!discoveredVersion) return undefined
  const version = normaliseDatasetVersion(dataset, discoveredVersion)
  const releaseRevisionChanged =
    releaseLastRevisedAt &&
    previous?.releaseLastRevisedAt &&
    releaseLastRevisedAt !== previous.releaseLastRevisedAt

  if (
    policy.correctionSuffixSource !== 'generated' ||
    !releaseRevisionChanged ||
    !previous?.versionKey
  ) {
    return version
  }

  const base =
    policy.scheme === 'initial-release-date'
      ? previous.versionKey.replace(/\.\d+$/, '')
      : version.replace(/\.\d+$/, '')
  const previousBase = previous.versionKey.replace(/\.\d+$/, '')
  if (policy.scheme !== 'initial-release-date' && base !== previousBase) {
    return version
  }

  const previousCorrection = readVersionCorrection(previous.versionKey, base) ?? 0
  return `${base}.${previousCorrection + 1}`
}

export function readVersionCorrection(version: string, base: string) {
  return Number(version.match(new RegExp(`^${base}\\.(\\d+)$`))?.[1]) || undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll('-', '')
}

export function safeFilePart(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
}
