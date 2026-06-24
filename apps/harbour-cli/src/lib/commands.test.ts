import { describe, expect, test } from 'bun:test'

import type { ParsedArgs } from './options.ts'
import { normalizeCommandArgs } from './commands.ts'

describe('normalizeCommandArgs', () => {
  test('maps upload cf aliases onto the canonical upload command', () => {
    const args: ParsedArgs = {
      command: 'upload:cf:preview',
      options: {},
      positionals: ['division.parquet'],
    }

    expect(normalizeCommandArgs(args)).toEqual({
      command: 'upload',
      options: {
        target: 'cf-preview',
      },
      positionals: ['division.parquet'],
    })
  })

  test('preserves explicit target overrides', () => {
    const args: ParsedArgs = {
      command: 'upload:cf:preview',
      options: {
        target: 'cf-production',
      },
      positionals: ['division.parquet'],
    }

    expect(normalizeCommandArgs(args)).toEqual({
      command: 'upload',
      options: {
        target: 'cf-production',
      },
      positionals: ['division.parquet'],
    })
  })

  test('leaves canonical commands unchanged', () => {
    const args: ParsedArgs = {
      command: 'upload',
      options: {
        target: 'local',
      },
      positionals: ['division.parquet'],
    }

    expect(normalizeCommandArgs(args)).toBe(args)
  })
})
