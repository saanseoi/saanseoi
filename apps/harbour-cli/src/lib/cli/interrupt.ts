import { emitKeypressEvents } from 'node:readline'

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
  pause?(): unknown
}

/**
 * Exit a command when its terminal sends an interrupt.
 *
 * Clack prompts switch stdin into raw mode while a progress control is active.
 * In raw mode Ctrl-C arrives as a keypress instead of SIGINT, so listen for
 * both forms before a control is created.
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

  if (inputRef === process.stdin) emitKeypressEvents(process.stdin)
  const interruptOnSigint = () => interrupt('SIGINT')
  const interruptOnSigterm = () => interrupt('SIGTERM')
  processRef.on('SIGINT', interruptOnSigint)
  processRef.on('SIGTERM', interruptOnSigterm)
  inputRef.on('keypress', interruptOnKeypress)

  return () => {
    processRef.off('SIGINT', interruptOnSigint)
    processRef.off('SIGTERM', interruptOnSigterm)
    inputRef.off('keypress', interruptOnKeypress)
    // emitKeypressEvents resumes the real terminal stream. Removing its
    // listener alone leaves Bun's event loop alive after a non-interactive
    // command (for example, a nested initialiser reconciliation) has finished.
    if (inputRef === process.stdin) inputRef.pause?.()
  }
}
