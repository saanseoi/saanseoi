import { describe, expect, test } from 'bun:test'

import { pendingCenstatdStatisticResourceTypes } from './hkgovCenstatdStatistics.ts'

describe('C&SD statistics ingestion idempotency', () => {
  test('skips only resource types already published for the requested source version', () => {
    expect(
      pendingCenstatdStatisticResourceTypes(
        [
          {
            sourceVersion: '2023-H2',
            status: 'published',
            type: 'divisionStatistic',
          },
          {
            sourceVersion: '2023-H2',
            status: 'published',
            type: 'divisionArea',
          },
          {
            sourceVersion: '2022',
            status: 'published',
            type: 'division',
          },
        ],
        '2023-H2',
        ['divisionStatistic', 'division', 'divisionArea'],
      ),
    ).toEqual(['division'])
  })

  test('does not treat a superseded resource as published', () => {
    expect(
      pendingCenstatdStatisticResourceTypes(
        [
          {
            sourceVersion: '2023-H2',
            status: 'superseded',
            type: 'divisionArea',
          },
        ],
        '2023-H2',
        ['divisionArea'],
      ),
    ).toEqual(['divisionArea'])
  })
})
