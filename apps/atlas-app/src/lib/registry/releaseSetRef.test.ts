import { describe, expect, test } from 'vitest'

import { resolveReleaseSetRef } from './releaseSetRef'
import type { ApiRelease } from './types'

const releases = [
  {
    code: 'divisions-geographic-2026-08-19.0',
    domainCode: 'geographic',
    status: 'current',
    displayStatus: 'current',
  },
  {
    code: 'divisions-geographic-2026-06-17.0',
    domainCode: 'geographic',
    status: 'archived',
    displayStatus: 'superseded',
  },
  {
    code: 'divisions-geographic-2026-05-01.0',
    domainCode: 'geographic',
    status: 'archived',
    displayStatus: 'superseded',
  },
  {
    code: 'divisions-geographic-2026-09-01.0',
    domainCode: 'geographic',
    status: 'draft',
    displayStatus: 'draft',
  },
  {
    code: 'divisions-overture-2026-08-19.0',
    domainCode: 'overture',
    status: 'current',
    displayStatus: 'current',
  },
] satisfies Array<Pick<ApiRelease, 'code' | 'displayStatus' | 'domainCode' | 'status'>>

describe('resolveReleaseSetRef', () => {
  test('preserves direct release-set codes, including drafts', () => {
    expect(
      resolveReleaseSetRef(releases, 'divisions-geographic-2026-09-01.0'),
    ).toMatchObject({
      status: 'draft',
    })
  })

  test('resolves the latest published release in a domain', () => {
    expect(resolveReleaseSetRef(releases, 'geographic:latest')).toMatchObject({
      code: 'divisions-geographic-2026-08-19.0',
    })
  })

  test('resolves the first published release in a domain', () => {
    expect(resolveReleaseSetRef(releases, 'geographic:first')).toMatchObject({
      code: 'divisions-geographic-2026-05-01.0',
    })
  })

  test('does not resolve unknown release-set references', () => {
    expect(resolveReleaseSetRef(releases, 'unknown:latest')).toBeUndefined()
    expect(resolveReleaseSetRef(releases, 'geographic:current')).toBeUndefined()
  })
})
