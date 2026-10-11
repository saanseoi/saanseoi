import type { HarbourReadableDb } from '@repo/core/db/types'
import { currentSchema, eq } from '@repo/db'
import { retainProducerAudit } from '../../api/producerAudit.ts'
import { deliverProducerAudit } from '../../api/producerAuditDelivery.ts'
import type { UploadTarget } from '../../cli/options.ts'
import { landsdStreetAssemblyRule } from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type { StreetDeliveryCounts } from './streetDelivery.ts'
import type { PreparedStreet } from './processLocalStreetSqlUploadTypes.ts'
import {
  indexCanonicalStreetIdsBySourceRecord,
  resolvePersistentStreetIds,
  validateBaselineCoverage,
} from './processLocalStreetSqlUploadPreparation.ts'
import {
  landsdStreetSourceRule,
  listCurrentMaterialisedStreets,
  listCurrentSourceRows,
} from './processLocalStreetSqlUploadRows.ts'

export function assertStreetSourceHashes(
  records: Array<{ base: { id: string }; sourceHash: string }>,
  rows: Array<{ sourceRecordId: string; versionHash: string }>,
) {
  const hashes = new Map(rows.map(row => [row.sourceRecordId, row.versionHash]))
  for (const record of records)
    if (hashes.get(record.base.id) !== record.sourceHash)
      throw new Error(`Delivered Street source hash differs: ${record.base.id}.`)
}

/** Verify delivered data before retaining an audit, including sealed SQL retries. */
export async function retainStreetProvenance(input: {
  target: UploadTarget
  directory: string
  resourceReleaseId: string
  datasetCode: string
  snapshotId: string
  scopeId: string
  preparedSha256: string
  records: PreparedStreet[]
  counts: StreetDeliveryCounts
  currentDb: HarbourReadableDb
  sourceDb: HarbourReadableDb
}) {
  const [sources, streets, changelog] = await Promise.all([
    listCurrentSourceRows(
      input.sourceDb,
      input.records.map(record => record.base.id),
    ),
    listCurrentMaterialisedStreets(input.currentDb, input.scopeId),
    input.currentDb
      .select({ recordKey: currentSchema.streetChangelog.recordKey })
      .from(currentSchema.streetChangelog)
      .where(eq(currentSchema.streetChangelog.snapshotId, input.scopeId))
      .all(),
  ])
  assertStreetSourceHashes(input.records, sources)
  if (input.counts.importedRows !== input.records.length)
    throw new Error('Retained Street input count differs from prepared evidence.')
  const ids = indexCanonicalStreetIdsBySourceRecord(streets)
  validateBaselineCoverage(
    input.records.map(record =>
      resolvePersistentStreetIds(record, ids.get(record.base.id) ?? []),
    ),
    streets,
  )
  const baselineCount = input.records.filter(
    record => record.sourceKind === 'baseline',
  ).length
  const localeCount = streets.reduce((sum, street) => sum + street.i18n.length, 0)
  await deliverProducerAudit({
    target: input.target,
    directory: input.directory,
    identity: JSON.stringify({
      resourceReleaseId: input.resourceReleaseId,
      snapshotId: input.snapshotId,
      preparedSha256: input.preparedSha256,
      counts: input.counts,
      streets: streets.length,
      locales: localeCount,
      changelog: changelog.length,
    }),
    retain: store =>
      retainProducerAudit(store, {
        scope: { stage: 'assembly', ownerId: input.snapshotId },
        resourceReleaseId: input.resourceReleaseId,
        datasetCode: input.datasetCode,
        rules: [
          {
            scope: { stage: 'ingestion', ownerId: input.resourceReleaseId },
            declaration: landsdStreetSourceRule.declaration,
            inputs: { 'prepared-street-evidence': input.records.length },
            outputs: { 'street-source-assertions': input.records.length },
            recordsAffected: input.counts.sourceRowsChanged,
            decisions: {
              retained: input.counts.sourceRowsChanged,
              unchanged: input.records.length - input.counts.sourceRowsChanged,
            },
          },
          {
            declaration: landsdStreetAssemblyRule.declaration,
            inputs: { 'street-source-assertions': input.records.length },
            outputs: {
              streets: streets.length,
              streetsI18n: localeCount,
              'street-changelog': changelog.length,
            },
            recordsAffected: input.counts.changedRows,
            decisions: { changed: input.counts.changedRows },
          },
        ],
        guards: [
          {
            scope: { stage: 'ingestion', ownerId: input.resourceReleaseId },
            id: 'street-source-hashes',
            summary:
              'Delivered source assertions match the validated prepared evidence.',
            consequence: 'block-ingestion',
            status: 'passed',
            checked: input.records.length,
            failed: 0,
            reason:
              'Every prepared source record has an identical current source hash.',
          },
          {
            id: 'street-baseline-coverage',
            summary: 'Every baseline record resolves to exactly one canonical street.',
            consequence: 'block-ingestion',
            status: 'passed',
            checked: baselineCount,
            failed: 0,
            reason:
              'Persistent identities and bilingual notice-history matches were verified against delivered streets.',
          },
        ],
      }),
  })
}
