import { log, progress, spinner } from '@clack/prompts'

type ProgressBar = ReturnType<typeof progress>
type ProgressSpinner = ReturnType<typeof spinner>
type ProgressRenderer = ProgressBar | ProgressSpinner

type ProgressState = {
  current: number
  max: number | null
}

type OperationProgressOptions = {
  ui?: {
    progress: typeof progress
    spinner: typeof spinner
    log: Pick<typeof log, 'step' | 'success' | 'error'>
  }
  /** Keep one live status line across a multi-step pipeline. */
  compact?: boolean
  /** Override terminal capability detection for an embedded CLI caller. */
  renderAnimated?: boolean
}

export class OperationProgress {
  private progressBar: ProgressRenderer | null = null
  private currentLabel: string | null = null
  private state: ProgressState | null = null
  private readonly compact: boolean
  private readonly renderAnimated: boolean
  private staticPhaseActive = false
  private readonly ui: NonNullable<OperationProgressOptions['ui']>

  constructor(options: OperationProgressOptions = {}) {
    this.ui = options.ui ?? { progress, spinner, log }
    this.compact = options.compact ?? false
    this.renderAnimated = options.renderAnimated ?? canRenderAnimatedProgress()
  }

  beginPhase(label: string, options: { current?: number; max?: number | null }) {
    if (this.compact) {
      this.currentLabel = label
      this.state = {
        current: Math.max(0, Math.floor(options.current ?? 0)),
        max: null,
      }
      if (!this.renderAnimated) {
        this.staticPhaseActive = true
        return
      }

      if (!this.progressBar) {
        this.progressBar = this.ui.spinner({ withGuide: false })
        this.progressBar.start(label)
      } else {
        this.progressBar.message(label)
      }
      return
    }

    if (this.progressBar) {
      this.progressBar.stop(this.currentLabel ?? label)
    } else if (this.staticPhaseActive) {
      this.ui.log.success(this.currentLabel ?? label)
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
      this.ui.log.step(label)
      return
    }

    this.progressBar = createProgressRenderer(this.state, this.ui)
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

    if (this.compact) {
      this.state = {
        current: Math.max(0, Math.floor(current)),
        max: null,
      }
      this.currentLabel = options?.label ?? this.currentLabel
      this.progressBar?.message(this.currentLabel)
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
      this.progressBar = createProgressRenderer(
        { current: nextCurrent, max: nextMax },
        this.ui,
      )
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

    if (this.compact) {
      if (message) {
        this.currentLabel = message
        this.progressBar?.message(message)
      }
      return
    }

    const currentLabel = this.currentLabel

    if (this.progressBar) {
      this.progressBar.stop(message ?? currentLabel)
    } else if (this.staticPhaseActive) {
      this.ui.log.success(message ?? currentLabel)
    }
    this.progressBar = null
    this.currentLabel = null
    this.state = null
    this.staticPhaseActive = false
  }

  /** Finish a compact pipeline and commit its one final status line. */
  writeResult(message: string) {
    this.ui.log.success(message, { spacing: 0, withGuide: true })
  }

  /** Finish a compact pipeline and commit its one final status line. */
  finish(message?: string) {
    if (!this.compact) {
      this.complete(message)
      return
    }

    if (!this.currentLabel || !this.state) return

    const finalLabel = message ?? this.currentLabel
    if (this.progressBar) {
      this.progressBar.stop(finalLabel)
      this.progressBar = null
    } else if (this.staticPhaseActive || !this.renderAnimated) {
      this.ui.log.success(finalLabel, { spacing: 0, withGuide: true })
    }
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
      this.progressBar.error(reason ? `${failureLabel}: ${reason}` : failureLabel)
      this.progressBar = null
    } else if (this.staticPhaseActive) {
      const reason = error instanceof Error ? error.message : String(error ?? '')
      const failureLabel = this.currentLabel
        ? `Failed during ${this.currentLabel}`
        : 'Failed'
      this.ui.log.error(reason ? `${failureLabel}: ${reason}` : failureLabel)
    }

    this.currentLabel = null
    this.state = null
    this.staticPhaseActive = false
  }

  hasActivePhase() {
    return this.progressBar !== null || this.staticPhaseActive
  }

  clear() {
    this.progressBar?.clear()
    this.progressBar = null
    this.currentLabel = null
    this.state = null
    this.staticPhaseActive = false
  }

  error(message: string) {
    if (this.progressBar) this.progressBar.error(message)
    else this.ui.log.error(message)
    this.clear()
  }
}

function canRenderAnimatedProgress() {
  return process.stdout.isTTY === true && process.env.TERM !== 'dumb'
}

function createProgressRenderer(
  state: ProgressState,
  ui: NonNullable<OperationProgressOptions['ui']>,
): ProgressRenderer {
  if (state.max === null) {
    return ui.spinner({ withGuide: true })
  }

  return ui.progress({
    max: Math.max(state.max, 1),
    withGuide: true,
  })
}
