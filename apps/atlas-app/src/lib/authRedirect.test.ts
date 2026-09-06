import { describe, expect, test } from 'bun:test'

import { getAuthRedirectPath, getSignInHref, getSignUpHref } from './authRedirect'

const currentUrl = new URL('https://saanseoi.hk/sign-in')

describe('getAuthRedirectPath', () => {
  test('keeps relative and same-origin destinations', () => {
    expect(getAuthRedirectPath('/account?tab=security#passkeys', currentUrl)).toBe(
      '/account?tab=security#passkeys',
    )
    expect(
      getAuthRedirectPath('https://saanseoi.hk/guides/create-a-map', currentUrl),
    ).toBe('/guides/create-a-map')
  })

  test('rejects executable and cross-origin destinations', () => {
    for (const candidate of [
      'javascript:alert(document.domain)',
      'data:text/html,<script>alert(1)</script>',
      '//example.com/account',
      '/\\example.com/account',
      'https://example.com/account',
    ]) {
      expect(getAuthRedirectPath(candidate, currentUrl)).toBe('/api-keys')
    }
  })

  test('uses the requested fallback for missing or malformed destinations', () => {
    expect(getAuthRedirectPath(null, currentUrl, '/')).toBe('/')
    expect(getAuthRedirectPath('http://[', currentUrl, '/')).toBe('/')
  })
})

describe('authentication page links', () => {
  test('preserve the full post-authentication destination', () => {
    const destination = '/guides/create-a-map?editor=zed#publish'

    expect(getSignInHref(destination)).toBe(
      '/sign-in?next=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed%23publish',
    )
    expect(getSignUpHref(destination)).toBe(
      '/sign-up?continue=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed%23publish',
    )
  })
})
