import { progress } from '@clack/prompts'

type ProgressBar = ReturnType<typeof progress>

type ProgressState = {
  current: number
  max: number | null
}

export class LocalUploadProgress {
  private progressBar: ProgressBar | null = null
  private currentLabel: string | null = null
  private state: ProgressState | null = null

  beginPhase(label: string, options: { current?: number; max?: number | null }) {
    if (this.progressBar) {
      this.progressBar.stop(this.currentLabel ?? label)
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
    this.progressBar = progress({
      max: Math.max(this.state.max ?? this.state.current, 1),
      withGuide: false,
    })
    this.progressBar.start(label)

    if (this.state.current > 0) {
      this.progressBar.advance(
        Math.min(this.state.current, this.state.max ?? this.state.current),
        label,
      )
    }
  }

  update(
    current: number,
    options?: { label?: string; max?: number | null; reset?: boolean },
  ) {
    if (!this.progressBar || !this.state || !this.currentLabel) {
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
      this.progressBar.clear()
      this.progressBar = progress({
        max: Math.max(nextMax ?? nextCurrent, 1),
        withGuide: false,
      })
      this.progressBar.start(nextLabel)
      if (nextCurrent > 0) {
        this.progressBar.advance(
          Math.min(nextCurrent, nextMax ?? nextCurrent),
          nextLabel,
        )
      }
      this.state = {
        ...previousState,
        current: nextCurrent,
        max: nextMax,
      }
      this.currentLabel = nextLabel
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

    if (delta > 0) {
      this.progressBar.advance(delta, nextLabel)
      return
    }

    this.progressBar.message(nextLabel)
  }

  message(label: string) {
    if (!this.progressBar) {
      return
    }

    this.currentLabel = label
    this.progressBar.message(label)
  }

  complete(message?: string) {
    if (!this.progressBar || !this.currentLabel || !this.state) {
      return
    }

    const currentLabel = this.currentLabel

    this.progressBar.stop(message ?? currentLabel)
    this.progressBar = null
    this.currentLabel = null
    this.state = null
  }

  fail() {
    if (this.progressBar) {
      this.progressBar.stop(
        this.currentLabel ? `Failed during ${this.currentLabel}` : 'Failed',
      )
      this.progressBar = null
    }

    this.currentLabel = null
    this.state = null
  }

  hasActivePhase() {
    return this.progressBar !== null
  }
}
