import type { UploadTarget } from '../../cli/options.ts'
import type { LocalDbCacheProgressEvent } from '../../dbCache/localDbCache.ts'
import type { OperationProgress } from '../../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  colorYellow,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../local/progressFormatting.ts'
import { runLocalProgressPhase } from '../local/orchestrator.ts'
import type { GeometryUploadPlan } from './processLocalDivisionGeometrySqlUploadTypes.ts'

export function updateDbCacheProgress(
  progress: OperationProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const current = Math.min(event.current, event.total)
  const label = formatGeometryProgressLabel(
    'Open local D1',
    describeDbCacheSubject(event),
    current,
    event.total,
  )

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, { current, max: event.total })
  } else {
    progress.update(current, { label, max: event.total })
  }
}

export function formatGeometryProgressLabel(
  action: string,
  subject: string,
  current?: number,
  total?: number,
) {
  return formatRunningPhaseLabel(colorTeal(action), colorRed(subject), current, total)
}

export function formatGeometryCompletedLabel(
  action: string,
  subject: string,
  count?: number,
  durationMs?: number,
) {
  return appendPhaseDetails(
    formatCompletedPhaseLabel(colorTeal(action), colorRed(subject), count),
    [formatDurationMs(durationMs ?? Number.NaN)],
  )
}

export async function runGeometryProgressPhase<T>(
  progress: OperationProgress,
  action: string,
  subject: string,
  operation: () => Promise<T>,
) {
  return runLocalProgressPhase(progress, { action, subject }, operation)
}

export function describeRemoteGeometryImport(
  name: 'current' | 'history' | 'meta' | 'source',
  plan: GeometryUploadPlan,
  target: UploadTarget,
) {
  switch (name) {
    case 'current':
      return formatTargetSubject(`current ${plan.resourceType}`, target)
    case 'history':
      return formatTargetSubject(`history ${plan.resourceType}`, target)
    case 'meta':
      return formatTargetSubject('snapshot metadata', target)
    case 'source':
      return formatTargetSubject(`source ${plan.resourceType}`, target)
  }
}

function formatTargetEnvironment(target: UploadTarget) {
  return target.remote && target.environment === 'production'
    ? 'prod'
    : target.environment
}

export function formatTargetSubject(subject: string, target: UploadTarget) {
  return `${colorRed(subject)} ${colorYellow(`@ ${formatTargetEnvironment(target)}`)}`
}

export function formatLocalTargetSubject(subject: string) {
  return `${colorRed(subject)} ${colorYellow('@ local')}`
}

export function formatMirrorSubject(target: UploadTarget, reused: boolean) {
  if (!target.remote) return colorRed('local database')

  return `${colorYellow(formatTargetEnvironment(target))} ${colorRed(`mirror${reused ? ' (hit)' : ''}`)}`
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
