import { describe, expect, test } from 'bun:test'

import { planCenstatdResourceLifecycle } from './censtatdResourceLifecycle.ts'

describe('combined C&SD resource lifecycle', () => {
  test('keeps the shared release open until its final resource', () => {
    expect(
      planCenstatdResourceLifecycle(['divisionStatistic', 'division', 'divisionArea']),
    ).toEqual([
      {
        deferSourcePublish: true,
        reuseExistingRelease: false,
        type: 'divisionStatistic',
      },
      {
        deferSourcePublish: true,
        reuseExistingRelease: true,
        type: 'division',
      },
      {
        deferSourcePublish: false,
        reuseExistingRelease: true,
        type: 'divisionArea',
      },
    ])
  })

  test('reuses an existing release when resuming only missing resources', () => {
    expect(
      planCenstatdResourceLifecycle(['divisionArea'], {
        releaseAlreadyExists: true,
      }),
    ).toEqual([
      {
        deferSourcePublish: false,
        reuseExistingRelease: true,
        type: 'divisionArea',
      },
    ])
  })
})
