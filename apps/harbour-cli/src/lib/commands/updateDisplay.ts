import { OperationProgress } from '../cli/operationProgress.ts'
import { log } from '@clack/prompts'
import type { UploadTarget } from '../cli/options.ts'
import type { DatasetFixture, DatasetIngestProgress } from '../sources/sourceUpdates.ts'
import {
  dim,
  formatCheckLine,
  formatDatasetCheckLine,
  formatDownloadCachedLine,
  formatDownloadCompleteLine,
  formatDownloadProgressLine,
  formatIngestProgressLine,
  formatUpdateProgressLine,
  formatSkippedDatasetLine,
} from './updateFormatting.ts'
import type { DatasetUpdate } from './updateTypes.ts'

function phaseHeading(phase: 'new-releases' | 'revisions' | 'archives') {
  return {
    'new-releases': 'NEW RELEASES',
    revisions: 'NEW REVISIONS',
    archives: 'SOURCE ARCHIVES TO MIRROR',
  }[phase]
}

export function logPhaseHeading(phase: 'new-releases' | 'revisions' | 'archives') {
  // The leading and trailing guide make each phase a connected branch while
  // retaining a clear pause before its dataset rows.
  log.message([phaseHeading(phase), ''], {
    secondarySymbol: dim('│'),
    spacing: 1,
    symbol: dim('├'),
    withGuide: true,
  })
}

export class UpdateRow {
  private active = false

  constructor(
    private readonly dataset: DatasetFixture,
    private readonly progress = new OperationProgress({ compact: true }),
  ) {}

  start(stage: string) {
    this.progress.beginPhase(`${formatUpdateProgressLine(this.dataset, stage)} `, {})
    this.active = true
  }

  message(stage: string) {
    const message = `${formatUpdateProgressLine(this.dataset, stage)} `
    if (this.active) {
      this.progress.message(message)
    } else {
      this.progress.beginPhase(message, {})
      this.active = true
    }
  }

  ingesting(progress: DatasetIngestProgress, target: UploadTarget) {
    this.message(formatIngestProgressLine(this.dataset, progress, target))
  }

  downloading(update: DatasetUpdate, index: number, total: number) {
    this.progress.beginPhase(
      `${formatDownloadProgressLine(this.dataset, index, total, update.version)} `,
      {},
    )
    this.active = true
  }

  downloaded(
    update: DatasetUpdate,
    index: number,
    total: number,
    targetVersion: string | undefined,
    elapsed: number,
    bytes: number,
  ) {
    this.progress.finish(
      formatDownloadCompleteLine(
        this.dataset,
        index,
        total,
        update.version,
        targetVersion,
        elapsed,
        bytes,
      ),
    )
    this.active = false
  }

  cached(
    update: DatasetUpdate,
    index: number,
    total: number,
    targetVersion: string | undefined,
    bytes: number,
  ) {
    log.success(
      formatDownloadCachedLine(
        this.dataset,
        index,
        total,
        update.version,
        targetVersion,
        bytes,
      ),
      { spacing: 0, withGuide: true },
    )
  }

  clear() {
    if (!this.active) return
    this.progress.clear()
    this.active = false
  }

  finish(status: string, version?: string, targetVersion?: string | null) {
    const message = formatCheckLine(this.dataset, status, version, targetVersion)
    if (status === 'ERROR') {
      this.stop(message, 'error')
    } else {
      this.stop(message, 'success')
    }
  }

  finishUpdates(
    updates: DatasetUpdate[],
    targetVersions: ReadonlyMap<string, string | null>,
  ) {
    if (
      updates.length > 0 &&
      updates.every(
        update => update.status === 'current' || update.status === 'skipped',
      )
    ) {
      this.skipped(
        updates.some(update => update.status === 'skipped')
          ? 'no action due'
          : 'no updates',
      )
      return
    }
    const message = formatDatasetCheckLine(this.dataset, updates, targetVersions)
    if (updates.some(update => update.status === 'error')) {
      this.stop(message, 'error')
    } else {
      this.stop(message, 'success')
    }
  }

  error(message: string) {
    this.stop(message, 'error')
  }

  skipped(reason: string) {
    this.clear()
    this.progress.writeResult(formatSkippedDatasetLine(this.dataset, reason))
  }

  private stop(message: string, status: 'error' | 'success') {
    if (this.active) {
      if (status === 'error') {
        this.progress.error(message)
      } else {
        this.progress.finish(message)
      }
    } else if (status === 'error') {
      log.error(message, { spacing: 0, withGuide: true })
    } else {
      this.progress.writeResult(message)
    }
    this.active = false
  }
}

export function clearResolvedPrompt() {
  if (!process.stdout.isTTY) return
  process.stdout.write('\x1B[2A\x1B[0J')
}

export function replaceResolvedDecision() {
  if (!process.stdout.isTTY) return
  process.stdout.write('\x1B[1A\x1B[2K\r')
}
