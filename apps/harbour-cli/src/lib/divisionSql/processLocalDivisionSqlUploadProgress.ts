import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import type { OperationProgress } from '../cli/operationProgress.ts'
import type { LocalDbCacheProgressEvent } from '../dbCache/localDbCache.ts'
import type { DivisionSqlArtefactManifest } from './processLocalDivisionSqlUploadTypes.ts'

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

export function formatLocalSetupProgressLabel(
  subject: string,
  current: number,
  total: number,
) {
  return formatRunningPhaseLabel(
    colorTeal('Prepare'),
    colorRed(subject),
    current,
    total,
  )
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

export function buildDivisionImportProgressConfig(
  manifest: DivisionSqlArtefactManifest,
  extraImportFileCount = 0,
) {
  const totalImportFiles = countDivisionImportFiles(manifest) + extraImportFileCount

  return {
    cleanup: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Cleanup'),
        colorRed('staging'),
      ),
      phase: 'cleanupDivisionSqlStaging',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Cleanup'),
          colorRed('staging'),
          current,
          1,
        )
      },
      totalUnits: 1,
    },
    importPhases: [
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlSource',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlHistory',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlCurrentInit',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: manifest.currentInitKey ? 1 : 0,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlCurrent',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlStats',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
    ],
    publish: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Publish'),
        colorRed('release'),
      ),
      phase: 'publishDataset',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Publish'),
          colorRed('release'),
          current,
          1,
        )
      },
      totalUnits: 1,
    },
  }
}

export function buildStreamingPhase(
  releaseId: string,
  releaseCode: string,
  phase: string,
  totalUnits: number,
  right: string,
) {
  return {
    completionLabel: formatCompletedPhaseLabel(
      colorTeal('Generate SQL'),
      right,
      totalUnits,
    ),
    label: formatRunningPhaseLabel(colorTeal('Generate SQL'), right, 0, totalUnits),
    labelForProgress(current: number) {
      return formatRunningPhaseLabel(
        colorTeal('Generate SQL'),
        right,
        current,
        totalUnits,
      )
    },
    phase,
    releaseCode,
    releaseId,
    totalUnits,
  } as const
}

export function countDivisionImportFiles(manifest: DivisionSqlArtefactManifest) {
  return manifest.currentInitKey ? 5 : 4
}
