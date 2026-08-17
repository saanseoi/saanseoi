import { describe, expect, test } from 'bun:test'

import { buildSourceReleaseAssembliesPresentation } from './releaseAssemblies.presentation'

describe('buildSourceReleaseAssembliesPresentation', () => {
  test('keeps the Assembly tab selected on a related source release', () => {
    const presentation = buildSourceReleaseAssembliesPresentation([
      {
        datasetCode: 'district-boundaries',
        href: '/sources/district-boundaries/2021',
        label: 'District boundaries',
        publisherName: 'Census and Statistics Department',
        role: 'lookup',
        sourceVersion: '2021',
      },
    ])

    expect(presentation.groups[0]?.entries[0]?.href).toBe(
      '/sources/district-boundaries/2021?tab=assembly',
    )
  })
})
