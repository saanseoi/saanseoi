import { resolve } from 'node:path'

import { LANDSD_STREET_NAMING_URL } from './landsd/street/landsdStreet.ts'
import {
  loadLandsdStreetBaselineRegistry,
  validateLandsdStreetCurrentRelease,
} from './landsd/street/landsdStreetBaselineRegistry.ts'
import {
  DEFAULT_BASELINE_REGISTRY_PATH,
  LANDSD_STREET_DATASET_CODE,
} from './landsd/street/landsdStreetIngestConfig.ts'
import { ingestLandsdStreetSource } from './landsd/street/landsdStreetIngest.ts'
import { publishLandsdStreetReleasePayloads } from './landsd/street/landsdStreetPublish.ts'
import { REPO_ROOT } from './sourceUpdatesConfig.ts'
import type { DatasetUpdate, LookupContext } from './sourceUpdatesTypes.ts'
import { safeFilePart } from './sourceUpdatesVersions.ts'

/**
 * The scheduled updater publishes only the checked-in current baseline cohort.
 * Notice discovery and historic evidence are explicit DataOps stages until a
 * correction-revision assembler can prove present-state identity parity.
 */
export async function lookupLandsdStreet({ dataset, targetVersions }: LookupContext) {
  const registry = await loadLandsdStreetBaselineRegistry(
    DEFAULT_BASELINE_REGISTRY_PATH,
  )
  if (!registry) {
    throw new Error(
      `Missing ${DEFAULT_BASELINE_REGISTRY_PATH}. Run hkgov-landsd-streets:current against local to prepare the reviewed baseline before using the updater.`,
    )
  }
  if (dataset.code !== LANDSD_STREET_DATASET_CODE) {
    throw new Error(`Unexpected LandsD street dataset ${dataset.code}.`)
  }

  const sourceUrl = dataset.sourceUrl ?? LANDSD_STREET_NAMING_URL
  const checkedAt = new Date().toISOString()
  const publishedVersion = targetVersions?.get(dataset.code)
  if (publishedVersion === registry.sourceVersion) {
    return {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      message:
        'The checked-in current LandsD street-name cohort is already published; historical notices remain separate revision work.',
      releaseLastRevisedAt: registry.sourceVersion.slice(0, 10),
      sourceCursor: [],
      sourceKey: dataset.code,
      sourceUrl,
      status: 'current',
      version: registry.sourceVersion,
      versionKey: registry.sourceVersion,
    } satisfies DatasetUpdate
  }

  return [
    {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      ingest: async (target, options = {}) => {
        const result = await ingestLandsdStreetSource({
          baselineCandidates: registry.records,
          baselineCohort: {
            sha256: registry.baselineSha256,
            sourceVersion: registry.sourceVersion,
          },
          includeBaseline: true,
          includeLandsdNotices: false,
          outputDir: resolve(
            REPO_ROOT,
            'data/hkgov/landsd/street',
            safeFilePart(registry.sourceVersion),
          ),
          sourceUrl,
          target,
          promptForCuration: false,
          onProgress: options.onProgress,
        })
        const release = result.releases[0]
        if (!release || result.releases.length !== 1) {
          throw new Error(
            `Current LandsD baseline ingestion must produce one release; produced ${result.releases.length}.`,
          )
        }
        validateLandsdStreetCurrentRelease({
          records: release.records,
          registry,
          sourceVersion: release.sourceVersion,
        })
        await publishLandsdStreetReleasePayloads(target, [release], {
          invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
          onProgress: ({ current, sourceVersion, total }) =>
            options.onProgress?.({
              current,
              message: `Publishing current street-name release ${current + 1}/${total}: v${sourceVersion}`,
              total,
            }),
          releaseNotesUrl: sourceUrl,
          forceUpload: options.forceUpload === true,
        })
      },
      message:
        'The reviewed LandsD gazetted-register baseline will be published without historical notice dependencies.',
      releaseLastRevisedAt: registry.sourceVersion.slice(0, 10),
      sourceCursor: [],
      sourceKey: dataset.code,
      sourceUrl,
      status: 'new' as const,
      version: registry.sourceVersion,
      versionKey: registry.sourceVersion,
    } satisfies DatasetUpdate,
  ]
}
