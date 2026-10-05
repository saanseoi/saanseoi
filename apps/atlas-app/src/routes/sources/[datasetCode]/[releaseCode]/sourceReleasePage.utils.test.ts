import { describe, expect, test } from 'bun:test'

import {
  buildSourceReleaseVersionLinks,
  getSourceRecordFamily,
  getSourceReleaseTabFromUrl,
  humaniseStat,
  selectDistrictAreas,
} from './sourceReleasePage.utils'

describe('source release page utilities', () => {
  test('normalises statistic labels while preserving SAR', () => {
    expect(humaniseStat('buildingType')).toBe('Building Type')
    expect(humaniseStat('SAR')).toBe('SAR')
    expect(humaniseStat(null)).toBe('Unspecified')
  })

  test('accepts only supported tabs from the URL', () => {
    expect(getSourceReleaseTabFromUrl(new URL('https://saanseoi.hk?tab=schema'))).toBe(
      'schema',
    )
    expect(getSourceReleaseTabFromUrl(new URL('https://saanseoi.hk?tab=stats'))).toBe(
      'stats',
    )
    expect(getSourceReleaseTabFromUrl(new URL('https://saanseoi.hk?tab=unknown'))).toBe(
      'notes',
    )
  })

  test('limits raw source-record tabs to their public API family', () => {
    expect(getSourceRecordFamily(['division'])).toBe('divisions')
    expect(getSourceRecordFamily(['divisionArea'])).toBe('divisions')
    expect(getSourceRecordFamily(['address'])).toBe('addresses')
    expect(getSourceRecordFamily(['place', 'address'])).toBe('places')
    expect(getSourceRecordFamily(['divisionStatistic', 'divisionArea'])).toBe('stats')
    expect(getSourceRecordFamily(['street'])).toBe('streets')
  })

  test('keeps note diff state on every older release link', () => {
    expect(
      buildSourceReleaseVersionLinks({
        datasetCode: 'places',
        versions: [
          { code: '2025', sourceVersion: '2025' },
          { code: '2024', sourceVersion: '2024' },
        ],
        activeTab: 'notes',
        showNoteDiff: true,
      }),
    ).toEqual([
      { code: '2025', href: '/sources/places/2025?view=diff', label: '2025' },
      { code: '2024', href: '/sources/places/2024', label: '2024' },
    ])
  })

  test('Usage keeps its Assembly toggle across release navigation', () => {
    expect(
      buildSourceReleaseVersionLinks({
        datasetCode: 'divisions',
        versions: [{ code: '2026' }],
        activeTab: 'usage',
        showNoteDiff: false,
        showAssembly: true,
      })[0]?.href,
    ).toBe('/sources/divisions/2026?tab=usage&view=assembly')
    expect(getSourceReleaseTabFromUrl(new URL('http://localhost/?tab=changes'))).toBe(
      'changes',
    )
    expect(getSourceReleaseTabFromUrl(new URL('http://localhost/?tab=usage'))).toBe(
      'usage',
    )
  })

  test('projects only polygon district coverage rows', () => {
    expect(
      selectDistrictAreas([
        {
          divisionId: 'north',
          geometry: { type: 'Polygon', coordinates: [] },
          name: 'North',
        },
        {
          divisionId: 'invalid',
          geometry: { type: 'LineString', coordinates: [] },
          name: 'Invalid',
        },
      ]),
    ).toEqual([
      {
        divisionId: 'north',
        geometry: { type: 'Polygon', coordinates: [] },
        name: 'North',
      },
    ])
  })
})

test('release navigation retains the selected changes filter', () => {
  expect(
    buildSourceReleaseVersionLinks({
      datasetCode: 'divisions',
      versions: [{ code: 'old' }],
      activeTab: 'changes',
      showNoteDiff: false,
      changeType: 'removed',
    })[0]?.href,
  ).toBe('/sources/divisions/old?tab=changes&changes=removed')
})
