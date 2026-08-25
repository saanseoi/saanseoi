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

  const inputRef = {
    off(
      _event: 'keypress',
      _listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      return inputRef
    },
    on(
      _event: 'keypress',
      _listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      return inputRef
    },
  }

  installInterruptHandler(processRef, inputRef)

  listeners.get('SIGINT')?.()
  listeners.get('SIGTERM')?.()

  expect(processRef.exitCode).toBe(130)
  expect(exits).toEqual([130])
})

test('removes its interrupt listeners when disposed', () => {
  const listeners = new Map<string, () => void>()
  const keypressListeners = new Set<
    (
      character: string,
      key: { ctrl?: boolean; name?: string; sequence?: string },
    ) => void
  >()
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

  const inputRef = {
    off(
      _event: 'keypress',
      listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      keypressListeners.delete(listener)
      return inputRef
    },
    on(
      _event: 'keypress',
      listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      keypressListeners.add(listener)
      return inputRef
    },
  }

  const dispose = installInterruptHandler(processRef, inputRef)
  dispose()

  expect(listeners.size).toBe(0)
  expect(keypressListeners.size).toBe(0)
})

test('exits when raw-mode Ctrl-C is received as a keypress', () => {
  const listeners = new Map<string, () => void>()
  const keypressListeners = new Set<
    (
      character: string,
      key: { ctrl?: boolean; name?: string; sequence?: string },
    ) => void
  >()
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
  const inputRef = {
    off(
      _event: 'keypress',
      listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      keypressListeners.delete(listener)
      return inputRef
    },
    on(
      _event: 'keypress',
      listener: (
        character: string,
        key: { ctrl?: boolean; name?: string; sequence?: string },
      ) => void,
    ) {
      keypressListeners.add(listener)
      return inputRef
    },
  }

  installInterruptHandler(processRef, inputRef)
  for (const listener of keypressListeners) {
    listener('\u0003', { ctrl: true, name: 'c', sequence: '\u0003' })
  }

  expect(processRef.exitCode).toBe(130)
  expect(exits).toEqual([130])
})
