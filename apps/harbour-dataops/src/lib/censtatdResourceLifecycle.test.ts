import { describe, expect, test } from 'bun:test'

import { planCenstatdResourceLifecycle } from './censtatdResourceLifecycle.ts'

describe('combined C&SD resource lifecycle', () => {
  test('bulk initialisation retains geometry drafts across sources until bootstrap', () => {
    const steps = planCenstatdResourceLifecycle(
      ['divisionStatistic', 'division', 'divisionArea', 'divisionArea'],
      { deferGeometryPublication: true },
    )
    expect(steps.map(step => step.deferSourcePublish)).toEqual([
      false,
      false,
      true,
      true,
    ])
    expect(steps.map(step => step.reuseExistingRelease)).toEqual([
      false,
      false,
      false,
      true,
    ])
  })
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

  test('keeps one repeated resource release open across snapshot cohorts', () => {
    expect(
      planCenstatdResourceLifecycle([
        'divisionStatistic',
        'divisionArea',
        'divisionArea',
        'divisionArea',
      ]),
    ).toEqual([
      {
        deferSourcePublish: false,
        reuseExistingRelease: false,
        type: 'divisionStatistic',
      },
      {
        deferSourcePublish: true,
        reuseExistingRelease: false,
        type: 'divisionArea',
      },
      {
        deferSourcePublish: true,
        reuseExistingRelease: true,
        type: 'divisionArea',
      },
      {
        deferSourcePublish: false,
        reuseExistingRelease: true,
        type: 'divisionArea',
      },
    ])
  })
})
