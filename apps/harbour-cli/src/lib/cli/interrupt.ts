import { emitKeypressEvents } from 'node:readline'

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
 * In raw mode Ctrl-C arrives as a keypress instead of SIGINT, so listen for
 * both forms before a control is created.
 */
export function installInterruptHandler(
  processRef: InterruptProcess = process,
  inputRef: InterruptInput = process.stdin,
) {
  let interrupted = false

  const interrupt = () => {
    if (interrupted) return
    interrupted = true
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
      interrupt()
    }
  }

  if (inputRef === process.stdin) emitKeypressEvents(process.stdin)
  processRef.on('SIGINT', interrupt)
  processRef.on('SIGTERM', interrupt)
  inputRef.on('keypress', interruptOnKeypress)

  return () => {
    processRef.off('SIGINT', interrupt)
    processRef.off('SIGTERM', interrupt)
    inputRef.off('keypress', interruptOnKeypress)
  }
}
