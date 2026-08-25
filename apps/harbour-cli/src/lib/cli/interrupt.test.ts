import { expect, test } from 'bun:test'

import { installInterruptHandler } from './interrupt.ts'

test('exits once with the conventional interrupt status', () => {
  const listeners = new Map<string, () => void>()
  const exits: number[] = []
  const processRef: {
    exit(code?: number): never
    exitCode: number | string | null
    off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
    on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
  } = {
    exit(code?: number) {
      exits.push(code ?? 0)
      return undefined as never
    },
    exitCode: null,
    off(signal) {
      listeners.delete(signal)
      return processRef
    },
    on(signal, listener) {
      listeners.set(signal, listener)
      return processRef
    },
  }

  installInterruptHandler(processRef)

  listeners.get('SIGINT')?.()
  listeners.get('SIGTERM')?.()

  expect(processRef.exitCode).toBe(130)
  expect(exits).toEqual([130])
})

test('removes its signal listeners when disposed', () => {
  const listeners = new Map<string, () => void>()
  const processRef: {
    exit(code?: number): never
    off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
    on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
  } = {
    exit() {
      return undefined as never
    },
    off(signal) {
      listeners.delete(signal)
      return processRef
    },
    on(signal, listener) {
      listeners.set(signal, listener)
      return processRef
    },
  }

  const dispose = installInterruptHandler(processRef)
  dispose()

  expect(listeners.size).toBe(0)
})
