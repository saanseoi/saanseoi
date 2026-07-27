import { describe, expect, test } from 'bun:test'

import { resolveInitialisationCommand } from './init.ts'

describe('initialisation commands', () => {
  test('maps each supported family and domain to a dedicated script', () => {
    expect(resolveInitialisationCommand('init')).toEqual({
      script: 'scripts/init/all.fish',
      supportsContinue: true,
    })
    expect(resolveInitialisationCommand('init:divisions:overture')).toEqual({
      script: 'scripts/init/divisions-overture.fish',
      supportsContinue: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-pu')).toEqual({
      script: 'scripts/init/divisions-hkgov-pland-pu.fish',
      supportsContinue: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-new-town')).toEqual(
      {
        script: 'scripts/init/divisions-hkgov-pland-new-town.fish',
        supportsContinue: true,
      },
    )
    expect(resolveInitialisationCommand('init:streets:hkgov-landsd')).toEqual({
      script: 'scripts/init/streets-hkgov-landsd.fish',
      supportsContinue: false,
    })
    expect(resolveInitialisationCommand('init:addresses:default')).toEqual({
      script: 'scripts/init/addresses-hkgov-dpo.fish',
      supportsContinue: false,
    })
  })

  test('does not resolve an unsupported family and domain', () => {
    expect(resolveInitialisationCommand('init:divisions:unknown')).toBeUndefined()
  })
})
