import type { resolveReleaseSetForRelease } from '@repo/core/db/metaRegistry'
import { describeTarget, formatField } from '../cli/display.ts'
import { resolveHarbourBaseUrl } from '../api/api.ts'
import type { UploadTarget } from '../cli/options.ts'
import type { OperationProgress } from '../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatCount,
  formatRunningPhaseLabel,
} from '../pipeline/local/progressFormatting.ts'
import type { LocalDbCacheProgressEvent } from '../dbCache/localDbCache.ts'
import type {
  ReleaseRecord,
  ResolvedReleaseRecord,
  RollbackOperation,
  RollbackPlanCounts,
  RollbackStepCounts,
} from './rollbackTypes.ts'

export function formatRollbackPlan(input: {
  counts: RollbackPlanCounts
  operation: RollbackOperation
  release: ResolvedReleaseRecord
  rowCount: number
  target: UploadTarget
}) {
  return [
    formatField('operation', input.operation),
    formatField('target', formatRollbackTarget(input.target)),
    formatField('dataset', input.release.datasetCode),
    formatField('release', input.release.releaseCode),
    formatField('cohortKey', input.release.cohortKey ?? '-'),
    formatField('rows', formatCount(input.rowCount)),
    '',
    formatField('source rows', formatStepCount(input.counts.source)),
    formatField('history rows', formatStepCount(input.counts.history)),
    formatField('current rows', formatStepCount(input.counts.current)),
    formatField('meta rows', formatStepCount(input.counts.meta)),
  ]
}

export function formatRollbackResult(input: {
  dryRun: boolean
  operation: RollbackOperation
  previousRelease: ReleaseRecord
  previousReleaseSet: Awaited<ReturnType<typeof resolveReleaseSetForRelease>>
  release: ResolvedReleaseRecord
  rollbackRoot: string
}) {
  return [
    formatField(
      'status',
      input.dryRun ? 'planned' : input.operation === 'purge' ? 'purged' : 'reverted',
    ),
    formatField('operation', input.operation),
    formatField('dataset', input.release.datasetCode),
    formatField('release', input.release.releaseCode),
    formatField('releaseId', input.release.releaseId),
    '',
    formatField('latest release', input.previousRelease?.releaseCode ?? '-'),
    formatField('releaseId', input.previousRelease?.releaseId ?? '-'),
    formatField('schemaVersion', input.previousReleaseSet?.schemaVersion ?? '-'),
    formatField('artefacts', input.rollbackRoot),
  ]
}

export function formatRollbackStepLabel(
  name: keyof RollbackPlanCounts,
  counts: RollbackStepCounts,
  currentStatements: number,
  totalStatements: number,
) {
  return appendPhaseDetails(
    formatRunningPhaseLabel(
      colorTeal('Rollback'),
      colorRed(name),
      currentStatements,
      Math.max(totalStatements, 1),
    ),
    [formatStepCount(counts)],
  )
}

function formatStepCount(counts: RollbackStepCounts) {
  return `${formatCount(counts.rows)} rows / ${formatCount(counts.tables)} tables`
}

function formatRollbackTarget(target: UploadTarget) {
  const label = describeTarget(target).label

  return target.remote ? `${label} (${resolveHarbourBaseUrl(target)})` : label
}

export function updateDbCacheProgress(
  progress: OperationProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const label = formatDbCacheProgressLabel(event)
  const current = Math.min(event.current, event.total)

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, {
      current,
      max: event.total,
    })
  } else {
    progress.update(current, {
      label,
      max: event.total,
    })
  }

  if (event.action === 'reuse-cache') {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Cache'), colorRed('hit'), 0),
        ['0 ms'],
      ),
    )
  }
}

function formatDbCacheProgressLabel(event: LocalDbCacheProgressEvent) {
  const subject = describeDbCacheSubject(event)

  return formatRunningPhaseLabel(
    colorTeal('Clone cache'),
    colorRed(subject),
    Math.min(event.current, event.total),
    event.total,
  )
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  const tableName = event.tableName
    ? event.filter
      ? `${event.tableName}:${event.filter}`
      : event.tableName
    : null

  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return tableName
        ? `${event.bindingName}.${tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return tableName ? `${event.bindingName}.${tableName}` : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
  }
}
