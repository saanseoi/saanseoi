type InterruptProcess = {
  exitCode?: number | string | null
  exit(code?: number): never
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
}

/**
 * Exit a non-interactive command when its terminal sends an interrupt.
 *
 * Clack progress controls install their own signal listeners to redraw the
 * terminal. Register this before creating any controls so an interrupt stops
 * the command rather than only cancelling the current progress display.
 */
export function installInterruptHandler(processRef: InterruptProcess = process) {
  let interrupted = false

  const interrupt = () => {
    if (interrupted) return
    interrupted = true
    processRef.exitCode = 130
    processRef.exit(130)
  }

  processRef.on('SIGINT', interrupt)
  processRef.on('SIGTERM', interrupt)

  return () => {
    processRef.off('SIGINT', interrupt)
    processRef.off('SIGTERM', interrupt)
  }
}
