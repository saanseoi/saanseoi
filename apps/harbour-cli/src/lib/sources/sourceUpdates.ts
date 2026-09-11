import type {
  DatasetFixture,
  DatasetUpdate,
  LookupAdapter,
  UpdateState,
} from './sourceUpdatesTypes.ts'
import { getSourceState, isUpdateCheckDue } from './sourceUpdatesState.ts'
import { isCsdiDataset, lookupCsdi } from './sourceUpdatesCsdi.ts'
import {
  normaliseDatasetVersion,
  readLatestLocalSourceVersion,
} from './sourceUpdatesVersions.ts'
import { lookupOverture } from './sourceUpdatesOverture.ts'
import { lookupDataGovHk } from './sourceUpdatesDataGovHk.ts'
import { lookupLandsdStreet } from './sourceUpdatesStreets.ts'

export async function lookupDatasetUpdates(
  dataset: DatasetFixture,
  previous?: UpdateState[string],
  targetVersions?: ReadonlyMap<string, string | null>,
  force = false,
): Promise<DatasetUpdate[]> {
  const adapter = resolveLookupAdapter(dataset)
  if (!adapter) {
    return [
      {
        dataset,
        message: 'No source-specific lookup is registered yet.',
        sourceUrl: dataset.sourceUrl,
        sourceKey: dataset.code,
        status: 'manual',
      },
    ]
  }

  if (dataset.updatePolicy?.allowUpdates === false) {
    return [
      skippedUpdate(
        dataset,
        dataset.code,
        'Updates are disabled by the dataset update policy.',
      ),
    ]
  }

  const sourcePrevious = getSourceState(previous, dataset.code, dataset.code)
  if (!isCsdiDataset(dataset) && !isUpdateCheckDue(dataset, sourcePrevious, force)) {
    return [
      skippedUpdate(
        dataset,
        dataset.code,
        `Update check is throttled to ${dataset.updatePolicy?.checkFrequency ?? 'daily'}.`,
      ),
    ]
  }

  try {
    const targetVersion = targetVersions?.get(dataset.code)
    const targetBaseline =
      targetVersion === undefined
        ? previous
        : {
            ...previous,
            versionKey:
              targetVersion === null
                ? 'sha256:target-has-no-release'
                : normaliseDatasetVersion(dataset, targetVersion),
          }
    const result = await adapter({
      dataset,
      localVersion:
        targetVersion === undefined
          ? await readLatestLocalSourceVersion(dataset.code)
          : targetVersion === null
            ? undefined
            : normaliseDatasetVersion(dataset, targetVersion),
      previous: targetBaseline,
      force,
      targetVersions,
    })
    const checkedAt = new Date().toISOString()
    return (Array.isArray(result) ? result : [result]).map(update => ({
      ...update,
      sourceKey: update.sourceKey ?? dataset.code,
      checkedAt: update.status === 'skipped' ? update.checkedAt : checkedAt,
    }))
  } catch (error) {
    return [
      {
        dataset,
        message: error instanceof Error ? error.message : String(error),
        sourceUrl: dataset.sourceUrl,
        sourceKey: dataset.code,
        status: 'error',
      },
    ]
  }
}

export async function lookupDatasetUpdate(
  dataset: DatasetFixture,
  previous?: UpdateState[string],
  targetVersion?: string | null,
  force = false,
): Promise<DatasetUpdate> {
  return (
    await lookupDatasetUpdates(
      dataset,
      previous,
      targetVersion === undefined
        ? undefined
        : new Map([[dataset.code, targetVersion]]),
      force,
    )
  )[0] as DatasetUpdate
}

function skippedUpdate(
  dataset: DatasetFixture,
  sourceKey: string,
  message: string,
): DatasetUpdate {
  return { dataset, sourceKey, status: 'skipped', message }
}

export function isNewUpdate(update: DatasetUpdate, previous?: UpdateState[string]) {
  return (
    update.status === 'new' &&
    Boolean(update.versionKey) &&
    update.versionKey !== previous?.versionKey
  )
}

export function datasetName(dataset: DatasetFixture) {
  return (
    dataset.i18n?.find(item => item.locale === 'en')?.name ??
    dataset.i18n?.[0]?.name ??
    dataset.code
  )
}

export function requireSingleResourceType(dataset: DatasetFixture) {
  const resourceTypes =
    dataset.resourceTypes ?? (dataset.resourceType ? [dataset.resourceType] : [])
  if (resourceTypes.length !== 1) {
    throw new Error(
      `Dataset ${dataset.code} has multiple resource types; it requires a source-specific fan-out adapter.`,
    )
  }

  return resourceTypes[0] as string
}

function resolveLookupAdapter(dataset: DatasetFixture): LookupAdapter | undefined {
  if (dataset.publisherCode === 'overture') return lookupOverture
  if (dataset.publisherCode === 'hkgov-dpo') return lookupDataGovHk
  if (isCsdiDataset(dataset)) return lookupCsdi
  if (dataset.code === 'ds-hk-hkgov-landsd-street') return lookupLandsdStreet
  return undefined
}

export {
  buildOverturistCommand,
  buildOverturistReleasesCommand,
} from './sourceUpdatesOverture.ts'

export {
  apiFamilyHeaders,
  datasetUpdateCheckFrequencies,
  type DatasetUpdateCheckFrequency,
  datasetReleaseDiscoveryKinds,
  type DatasetReleaseDiscoveryKind,
  type DatasetUpdateCheck,
  datasetUpdatePhases,
  type DatasetUpdatePhase,
  type DatasetUpdatePolicy,
  datasetArchiveAvailability,
  type DatasetArchiveAvailability,
  archiveDiscoveryOperations,
  type ArchiveDiscoveryOperation,
  type DatasetReleasePolicy,
  type DatasetVersionPolicy,
  datasetCorrectionSuffixSources,
  type DatasetCorrectionSuffixSource,
  type DatasetReleaseField,
  type DatasetRelease,
  type DatasetFixture,
  type CompositionIngestDependency,
  type UpdateUpload,
  type DatasetIngestProgress,
  type DatasetUpdate,
  type CsdiArchivedSource,
  type UpdateStateEntry,
  type UpdateSourceState,
  type UpdatePhaseState,
  type UpdateArchiveMirrorState,
  type UpdateDatabaseImportState,
} from './sourceUpdatesTypes.ts'

export {
  loadDatasetFixtures,
  loadCurrentCompositionIngestDependencies,
  orderDatasetsByCompositionDependencies,
} from './sourceUpdatesCatalog.ts'

export {
  readUpdateState,
  writeUpdateState,
  isUpdateCheckDue,
  shouldCheckDataset,
  getDueUpdatePhases,
  recordUpdatePhaseCheck,
  recordUpdateState,
  recordUpdateArchiveMirror,
  recordUpdateDatabaseImport,
} from './sourceUpdatesState.ts'

export {
  findCsdiDatasetRelease,
  fetchCsdiArchivedSources,
  readCsdiArchivedSources,
} from './sourceUpdatesCsdi.ts'

export {
  buildHkgovPlandArchiveIngestCommand,
  buildHkgovCenstatdDistrictStatisticArchiveIngestCommand,
  buildHkgovCenstatdDistrictArchiveIngestCommand,
  buildHkgovHydStreetArchiveIngestCommand,
  buildHkgovLandsdPlaceNameArchiveIngestCommand,
  buildHkgovLandsdRoadCentrelineArchiveIngestCommand,
  buildHkgovCenstatdStatisticsArchiveIngestCommand,
  buildHkgovHadDistrictArchiveIngestCommand,
} from './sourceUpdatesArchiveIngest.ts'

export {
  resolveCsdiArchiveRedirect,
  assertCsdiArchiveUrl,
  assertCsdiArchiveDownload,
} from './sourceUpdatesDownloads.ts'

export {
  formatHkgovAlsReviewCommand,
  buildHkgovAlsIngestCommand,
} from './sourceUpdatesDataGovHk.ts'

export {
  normaliseDatasetVersion,
  resolveDatasetVersion,
} from './sourceUpdatesVersions.ts'
