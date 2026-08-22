import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import MobileMenu from './mobileMenu.svelte'

test('shows signed-in account actions in the mobile menu', async () => {
  const screen = await render(MobileMenu, {
    user: {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    },
  })

  await screen.getByRole('button', { name: 'Open navigation menu' }).click()

  await expect.element(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: 'Settings' }))
    .toHaveAttribute('href', '/account')
  await expect.element(screen.getByText('API keys')).not.toBeInTheDocument()

  const signOut = Array.from(document.querySelectorAll('button')).find(
    button => button.textContent?.trim() === 'Sign out',
  )
  const settings = document.querySelector('a[href="/account"]')

  expect(signOut?.parentElement).toBe(settings?.parentElement)
})
