import { describe, expect, test } from 'bun:test'

import { getReleaseLinksOutline } from './releaseLinksOutline'

const presentation = {
  groups: [
    {
      entries: [
        {
          eyebrow: 'Division boundary',
          href: '/sources/boundary/2025-09-24',
          id: 'boundary-2025-09-24',
          title: 'v2025-09-24.0',
        },
      ],
      id: 'source-records:division-boundary:2025-09-24',
      label: 'Division boundary',
      title: 'Source records',
    },
    {
      entries: [],
      id: 'empty',
      title: 'Empty',
    },
  ],
}

describe('getReleaseLinksOutline', () => {
  test('uses release entries for the source-release outline', () => {
    expect(getReleaseLinksOutline(presentation)).toEqual([
      {
        depth: 2,
        id: 'boundary-2025-09-24',
        label: 'Division boundary · v2025-09-24.0',
      },
    ])
  })

  test('uses rendered group headers for the API release outline', () => {
    expect(getReleaseLinksOutline(presentation, 'groups')).toEqual([
      {
        depth: 2,
        id: 'source-records:division-boundary:2025-09-24',
        label: 'Division boundary · Source records',
      },
    ])
  })
})
