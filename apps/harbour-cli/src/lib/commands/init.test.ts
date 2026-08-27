import { describe, expect, test } from 'bun:test'

import {
  formatInitialisationSummary,
  interruptInitialisationProcess,
  resolveInitialisationCommand,
} from './init.ts'
import { parseInitialisationSummaryEvents } from './initialisationSummary.ts'

describe('initialisation commands', () => {
  test('maps each supported family and domain to a dedicated script', () => {
    expect(resolveInitialisationCommand('init')).toEqual({
      script: 'scripts/init/all.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:local')).toEqual({
      script: 'scripts/init/local.fish',
      supportsContinue: false,
      supportsTarget: false,
    })
    expect(resolveInitialisationCommand('init:divisions:geographic')).toEqual({
      script: 'scripts/init/divisions-overture.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-pu')).toEqual({
      script: 'scripts/init/divisions-hkgov-pland-pu.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-landsd')).toEqual({
      script: 'scripts/init/divisions-hkgov-landsd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-new-town')).toEqual(
      {
        script: 'scripts/init/divisions-hkgov-pland-new-town.fish',
        supportsContinue: true,
        supportsTarget: true,
      },
    )
    expect(resolveInitialisationCommand('init:streets:hkgov-landsd')).toEqual({
      script: 'scripts/init/streets-hkgov-landsd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:addresses:official')).toEqual({
      script: 'scripts/init/addresses-hkgov-dpo.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:stats:official')).toEqual({
      script: 'scripts/init/stats-hkgov-censtatd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
  })

  test('does not resolve an unsupported family and domain', () => {
    expect(resolveInitialisationCommand('init:divisions:unknown')).toBeUndefined()
  })

  test('interrupts the complete detached initialisation process group', () => {
    const signals: Array<[number, NodeJS.Signals]> = []
    const child = {
      kill() {
        throw new Error('the direct child should not be signalled on POSIX')
      },
      pid: 1234,
    }

    interruptInitialisationProcess(child, 'SIGINT', {
      kill(pid, signal) {
        signals.push([pid, signal])
      },
      platform: 'linux',
    })

    expect(signals).toEqual([[-1234, 'SIGINT']])
  })

  test('uses the direct child signal when a process group is unavailable', () => {
    const signals: NodeJS.Signals[] = []
    const child = {
      kill(signal?: number | NodeJS.Signals) {
        if (typeof signal === 'string') signals.push(signal)
      },
      pid: 1234,
    }

    interruptInitialisationProcess(child, 'SIGTERM', {
      kill() {
        throw new Error('no such process group')
      },
      platform: 'linux',
    })

    expect(signals).toEqual(['SIGTERM'])
  })

  test('summarises new API release sets and failed source-release publication', () => {
    const events = parseInitialisationSummaryEvents(
      [
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
        JSON.stringify({
          command: 'init:divisions:geographic',
          message: 'Geometry validation failed.',
          releaseCode: 'dr-hk-overture-division-area-2026-08-19.0',
          type: 'error',
        }),
      ].join('\n'),
    )

    expect(
      formatInitialisationSummary(
        new Set(['data-hk-divisions-2026-07-22.0']),
        new Set(['data-hk-divisions-2026-07-22.0', 'data-hk-divisions-2026-08-19.0']),
        events,
      ),
    ).toBe(
      [
        'Published API release sets',
        '  data-hk-divisions-2026-08-19.0',
        '',
        'Initialisation errors',
        '  dr-hk-overture-division-area-2026-08-19.0: Geometry validation failed.',
      ].join('\n'),
    )
  })

  test('deduplicates release sets published during upload and reconciliation', () => {
    const events = parseInitialisationSummaryEvents(
      [
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
      ].join('\n'),
    )

    expect(formatInitialisationSummary(undefined, undefined, events)).toBe(
      [
        'Published API release sets',
        '  data-hk-divisions-2026-08-19.0',
        '',
        'Initialisation errors',
        '  -',
      ].join('\n'),
    )
  })
})
