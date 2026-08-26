import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import HeaderActions from './headerActions.svelte'

test('keeps the page scrollable while the account menu is open', async () => {
  const screen = await render(HeaderActions, {
    user: {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    },
  })

  await screen.getByRole('button', { name: 'Open account menu' }).click()

  await expect.element(screen.getByText('Account settings')).toBeVisible()
  expect(document.body.style.overflow).not.toBe('hidden')
})

test('uses the supplied post-authentication destinations', async () => {
  const screen = await render(HeaderActions, {
    signInHref: '/sign-in?next=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed',
    signUpHref: '/sign-up?continue=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed',
  })

  await expect
    .element(screen.getByRole('link', { name: 'Sign in' }))
    .toHaveAttribute('href', '/sign-in?next=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed')
  await expect
    .element(screen.getByRole('link', { name: 'Sign up' }))
    .toHaveAttribute(
      'href',
      '/sign-up?continue=%2Fguides%2Fcreate-a-map%3Feditor%3Dzed',
    )
})
