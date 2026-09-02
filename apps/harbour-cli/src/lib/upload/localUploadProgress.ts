import { log, progress, spinner } from '@clack/prompts'

type ProgressBar = ReturnType<typeof progress>
type ProgressSpinner = ReturnType<typeof spinner>
type ProgressRenderer = ProgressBar | ProgressSpinner

type ProgressState = {
  current: number
  max: number | null
}

type LocalUploadProgressOptions = {
  /** Override terminal capability detection for an embedded CLI caller. */
  renderAnimated?: boolean
}

export class LocalUploadProgress {
  private progressBar: ProgressRenderer | null = null
  private currentLabel: string | null = null
  private state: ProgressState | null = null
  private readonly renderAnimated: boolean
  private staticPhaseActive = false

  constructor(options: LocalUploadProgressOptions = {}) {
    this.renderAnimated = options.renderAnimated ?? canRenderAnimatedProgress()
  }

  beginPhase(label: string, options: { current?: number; max?: number | null }) {
    if (this.progressBar) {
      this.progressBar.stop(this.currentLabel ?? label)
    } else if (this.staticPhaseActive) {
      log.success(this.currentLabel ?? label)
    }

    this.currentLabel = label
    this.state = {
      current: Math.max(0, Math.floor(options.current ?? 0)),
      max:
        typeof options.max === 'number' &&
        Number.isFinite(options.max) &&
        options.max > 0
          ? Math.floor(options.max)
          : null,
    }
    if (!this.renderAnimated) {
      this.staticPhaseActive = true
      log.step(label)
      return
    }

    this.progressBar = createProgressRenderer(this.state)
    this.progressBar.start(label)

    if (this.state.max !== null && this.state.current > 0) {
      ;(this.progressBar as ProgressBar).advance(
        Math.min(this.state.current, this.state.max ?? this.state.current),
        label,
      )
    }
  }

  update(
    current: number,
    options?: { label?: string; max?: number | null; reset?: boolean },
  ) {
    if (!this.state || !this.currentLabel) {
      return
    }

    const previousState = this.state
    const nextCurrent = Math.max(0, Math.floor(current))
    const nextMax =
      typeof options?.max === 'number' &&
      Number.isFinite(options.max) &&
      options.max > 0
        ? Math.floor(options.max)
        : options?.max === null
          ? null
          : previousState.max
    const nextLabel = options?.label ?? this.currentLabel

    if (options?.reset || nextMax !== previousState.max) {
      this.state = {
        ...previousState,
        current: nextCurrent,
        max: nextMax,
      }
      this.currentLabel = nextLabel

      if (!this.progressBar) {
        return
      }

      this.progressBar.clear()
      this.progressBar = createProgressRenderer({ current: nextCurrent, max: nextMax })
      this.progressBar.start(nextLabel)
      if (nextMax !== null && nextCurrent > 0) {
        ;(this.progressBar as ProgressBar).advance(
          Math.min(nextCurrent, nextMax ?? nextCurrent),
          nextLabel,
        )
      }
      return
    }

    const previousApplied = Math.min(
      previousState.current,
      previousState.max ?? previousState.current,
    )
    const nextApplied = Math.min(nextCurrent, nextMax ?? nextCurrent)
    const delta = Math.max(0, nextApplied - previousApplied)
    this.state = {
      ...previousState,
      current: nextCurrent,
    }
    this.currentLabel = nextLabel

    if (!this.progressBar) {
      return
    }

    if (nextMax !== null && delta > 0) {
      ;(this.progressBar as ProgressBar).advance(delta, nextLabel)
      return
    }

    this.progressBar.message(nextLabel)
  }

  message(label: string) {
    if (!this.currentLabel) {
      return
    }

    this.currentLabel = label
    this.progressBar?.message(label)
  }

  complete(message?: string) {
    if (!this.currentLabel || !this.state) {
      return
    }

    const currentLabel = this.currentLabel

    if (this.progressBar) {
      this.progressBar.stop(message ?? currentLabel)
    } else if (this.staticPhaseActive) {
      log.success(message ?? currentLabel)
    }
    this.progressBar = null
    this.currentLabel = null
    this.state = null
    this.staticPhaseActive = false
  }

  fail(error?: unknown) {
    if (this.progressBar) {
      const reason = error instanceof Error ? error.message : String(error ?? '')
      const failureLabel = this.currentLabel
        ? `Failed during ${this.currentLabel}`
        : 'Failed'
      this.progressBar.stop(reason ? `${failureLabel}: ${reason}` : failureLabel)
      this.progressBar = null
    } else if (this.staticPhaseActive) {
      const reason = error instanceof Error ? error.message : String(error ?? '')
      const failureLabel = this.currentLabel
        ? `Failed during ${this.currentLabel}`
        : 'Failed'
      log.error(reason ? `${failureLabel}: ${reason}` : failureLabel)
    }

    this.currentLabel = null
    this.state = null
    this.staticPhaseActive = false
  }

  hasActivePhase() {
    return this.progressBar !== null || this.staticPhaseActive
  }
}

function canRenderAnimatedProgress() {
  return process.stdout.isTTY === true && process.env.TERM !== 'dumb'
}

function createProgressRenderer(state: ProgressState): ProgressRenderer {
  if (state.max === null) {
    return spinner({ withGuide: true })
  }

  return progress({
    max: Math.max(state.max, 1),
    withGuide: true,
  })
}
