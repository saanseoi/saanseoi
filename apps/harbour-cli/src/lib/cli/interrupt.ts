type InterruptCleanup = (signal: 'SIGINT' | 'SIGTERM') => void

const interruptCleanups = new Set<InterruptCleanup>()

/**
 * Register synchronous work that must run before the CLI exits on Ctrl-C.
 *
 * The interrupt handler calls `process.exit()`, so asynchronous cleanup would
 * be abandoned before it can complete.
 */
export function registerInterruptCleanup(cleanup: InterruptCleanup) {
  interruptCleanups.add(cleanup)
  return () => interruptCleanups.delete(cleanup)
}

type InterruptProcess = {
  exitCode?: number | string | null
  exit(code?: number): never
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
}

type InterruptInput = {
  off(
    event: 'keypress',
    listener: (
      character: string,
      key: { ctrl?: boolean; name?: string; sequence?: string },
    ) => void,
  ): unknown
  on(
    event: 'keypress',
    listener: (
      character: string,
      key: { ctrl?: boolean; name?: string; sequence?: string },
    ) => void,
  ): unknown
}

/**
 * Exit a command when its terminal sends an interrupt.
 *
 * Clack prompts switch stdin into raw mode while a progress control is active.
 * In raw mode Ctrl-C arrives as a keypress instead of SIGINT. Observe Clack's
 * keypress events without installing a second decoder; a data listener here
 * would consume input from an interactive child process sharing the terminal.
 */
export function installInterruptHandler(
  processRef: InterruptProcess = process,
  inputRef: InterruptInput = process.stdin,
) {
  let interrupted = false

  const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    if (interrupted) return
    interrupted = true
    for (const cleanup of interruptCleanups) {
      try {
        cleanup(signal)
      } catch {
        // An interrupt must still terminate the CLI if process cleanup fails.
      }
    }
    processRef.exitCode = 130
    processRef.exit(130)
  }

  const interruptOnKeypress = (
    character: string,
    key: { ctrl?: boolean; name?: string; sequence?: string },
  ) => {
    if (
      character === '\u0003' ||
      key.sequence === '\u0003' ||
      (key.ctrl === true && key.name === 'c')
    ) {
      interrupt('SIGINT')
    }
  }

  const interruptOnSigint = () => interrupt('SIGINT')
  const interruptOnSigterm = () => interrupt('SIGTERM')
  processRef.on('SIGINT', interruptOnSigint)
  processRef.on('SIGTERM', interruptOnSigterm)
  inputRef.on('keypress', interruptOnKeypress)

  return () => {
    processRef.off('SIGINT', interruptOnSigint)
    processRef.off('SIGTERM', interruptOnSigterm)
    inputRef.off('keypress', interruptOnKeypress)
  }
}
