import { resolve } from 'node:path'
import type { LookupContext, DatasetUpdate } from './sourceUpdatesTypes'
import { REPO_ROOT } from './sourceUpdatesConfig'
import { downloadResponse } from './sourceUpdatesDownloads'

/** Only checked-in editions are eligible; discovery never invents curation decisions. */
export async function lookupReviewedReleases({
  dataset,
  targetVersions,
}: LookupContext): Promise<DatasetUpdate[]> {
  return [...(dataset.releases ?? [])]
    .sort((a, b) =>
      (a.sourceVersion ?? '').localeCompare(b.sourceVersion ?? '', 'en', {
        numeric: true,
      }),
    )
    .map(release => {
      const version = release.sourceVersion
      if (!version) throw new Error(`Missing reviewed version for ${dataset.code}.`)
      const superseded = [...(targetVersions?.entries() ?? [])].some(
        ([key, value]) =>
          key === value && key.localeCompare(version, 'en', { numeric: true }) > 0,
      )
      return {
        dataset,
        sourceKey: version,
        targetSourceKey: version,
        version,
        versionKey: version,
        sourceUrl: release.sourceUrl ?? dataset.sourceUrl,
        status:
          targetVersions?.get(version) === version
            ? 'current'
            : superseded
              ? 'skipped'
              : 'new',
        ...(superseded && targetVersions?.get(version) !== version
          ? {
              message:
                'A newer reviewed edition is already published; historical replay requires the initialiser.',
            }
          : {}),
        deferStateUntilProcessed: true,
        ingest: async target => {
          let command: string[]
          if (dataset.code === 'ds-hk-protomaps-island') {
            const { loadPinnedReviewArchive } = await import(
              '../pipeline/curatedDivisions/reviewSourceArchives'
            )
            const { default: review } = await import(
              '../../../../../fixtures/meta/datasetInputs/saanseoi-division-review.json'
            )
            const { default: publication } = await import(
              '../../../../../fixtures/meta/datasetInputs/saanseoi-division-release-inputs.json'
            )
            const pin = [...review.sourceReleases, ...publication.sourceReleases].find(
              pin => pin.datasetCode === dataset.code && pin.sourceVersion === version,
            )
            if (!pin)
              throw new Error(`No reviewed archive pin for ${dataset.code}/${version}.`)
            const path = await loadPinnedReviewArchive(pin, {
              root: REPO_ROOT,
              archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
            })
            command = ['protomaps-islands:ingest', path]
          } else {
            if (!release.sourceUrl)
              throw new Error(`Missing RVD source URL for ${version}.`)
            const path = resolve(REPO_ROOT, 'data/hkgov/rvd', version, '06.pdf')
            await downloadResponse(release.sourceUrl, path)
            command = [
              'hkgov-rvd:areas',
              path,
              '--out-dir',
              resolve(REPO_ROOT, '.local/rvd-review/ingested'),
            ]
          }
          const child = Bun.spawn(
            [
              process.execPath,
              'run',
              '--silent',
              'dataops',
              '--',
              ...command,
              '--target',
              target.remote ? target.environment : 'local',
            ],
            { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
          )
          if (await child.exited)
            throw new Error(
              `Reviewed release ingestion failed for ${dataset.code}/${version}.`,
            )
        },
      } satisfies DatasetUpdate
    })
}
