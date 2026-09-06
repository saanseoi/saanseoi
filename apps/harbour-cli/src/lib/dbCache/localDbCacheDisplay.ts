import type { OperationProgress } from '../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import type { LocalDbCacheProgressEvent } from './localDbCacheTypes.ts'

export function updateDbCacheProgress(
  progress: OperationProgress,
  event: LocalDbCacheProgressEvent,
  options: {
    completeOnReuse?: boolean
    operation?: 'clone' | 're-export'
  } = {},
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const label = formatDbCacheProgressLabel(event, options.operation)
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

  if (event.action === 'reuse-cache' && options.completeOnReuse !== false) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Cache'), colorRed('hit'), 0),
        ['0 ms'],
      ),
    )
  }
}

function formatDbCacheProgressLabel(
  event: LocalDbCacheProgressEvent,
  operation: 'clone' | 're-export' = 'clone',
) {
  const subject = describeDbCacheSubject(event)

  return formatRunningPhaseLabel(
    colorTeal(operation === 're-export' ? 'Re-export cache' : 'Clone cache'),
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
