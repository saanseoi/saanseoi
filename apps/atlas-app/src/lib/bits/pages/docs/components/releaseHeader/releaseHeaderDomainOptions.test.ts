import { describe, expect, test } from 'vitest'

import { getReleaseHeaderDomainOptions } from './releaseHeaderDomainOptions'

describe('getReleaseHeaderDomainOptions', () => {
  test('lists configured published domains in composition order', () => {
    const api = {
      familyType: 'divisions',
      apiComposition: [
        {
          status: 'current',
          version: 1,
          i18n: {
            overture: [],
            'hkgov-pland-pu': [],
            'hkgov-pland-new-town': [],
            'hkgov-landsd': [],
          },
        },
      ],
      releases: [
        { code: 'overture-new', domainCode: 'overture', status: 'published' },
        { code: 'overture-old', domainCode: 'overture', status: 'published' },
        { code: 'planning-unit', domainCode: 'hkgov-pland-pu', status: 'published' },
        { code: 'new-town-draft', domainCode: 'hkgov-pland-new-town', status: 'draft' },
      ],
    }

    expect(
      getReleaseHeaderDomainOptions(api as never, api.releases[0] as never),
    ).toEqual([
      { code: 'overture', href: '/apis/divisions/overture-new' },
      { code: 'hkgov-pland-pu', href: '/apis/divisions/planning-unit' },
    ])
  })

  test('keeps the current draft release selectable and includes unconfigured domains', () => {
    const currentRelease = {
      code: 'current-draft',
      domainCode: 'experimental',
      status: 'draft',
    }
    const api = {
      familyType: 'divisions',
      apiComposition: [{ status: 'current', version: 1, i18n: { overture: [] } }],
      releases: [
        { code: 'overture', domainCode: 'overture', status: 'published' },
        currentRelease,
      ],
    }

    expect(
      getReleaseHeaderDomainOptions(api as never, currentRelease as never),
    ).toEqual([
      { code: 'overture', href: '/apis/divisions/overture' },
      { code: 'experimental', href: '/apis/divisions/current-draft' },
    ])
  })
})
