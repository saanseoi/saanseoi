import { describe, expect, test } from 'bun:test'

import { resolveInitialisationCommand } from './init.ts'

describe('initialisation commands', () => {
  test('maps each supported family and domain to a dedicated script', () => {
    expect(resolveInitialisationCommand('init')).toEqual({
      script: 'scripts/init/all.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:geophraphic')).toEqual({
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
  })

  test('does not resolve an unsupported family and domain', () => {
    expect(resolveInitialisationCommand('init:divisions:unknown')).toBeUndefined()
  })
})
