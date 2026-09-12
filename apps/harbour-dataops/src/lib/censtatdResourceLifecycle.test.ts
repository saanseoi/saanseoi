import { describe, expect, test } from 'bun:test'

import { planCenstatdResourceLifecycle } from './censtatdResourceLifecycle.ts'

describe('combined C&SD resource lifecycle', () => {
  test('completes each resource independently', () => {
    expect(
      planCenstatdResourceLifecycle(['divisionStatistic', 'division', 'divisionArea']),
    ).toEqual([
      {
        deferSourcePublish: false,
        reuseExistingRelease: false,
        type: 'divisionStatistic',
      },
      {
        deferSourcePublish: false,
        reuseExistingRelease: false,
        type: 'division',
      },
      {
        deferSourcePublish: false,
        reuseExistingRelease: false,
        type: 'divisionArea',
      },
    ])
  })

  test('does not reuse siblings when resuming missing resources', () => {
    expect(planCenstatdResourceLifecycle(['divisionArea'])).toEqual([
      {
        deferSourcePublish: false,
        reuseExistingRelease: false,
        type: 'divisionArea',
      },
    ])
  })
})
