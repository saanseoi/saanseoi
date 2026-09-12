import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import MobileMenu from './mobileMenu.svelte'

test('shows signed-in account actions in the mobile menu', async () => {
  await page.viewport(390, 844)
  const screen = await render(MobileMenu, {
    user: {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    },
  })

  await screen.getByRole('button', { name: 'Open navigation menu' }).click()

  const dialog = page.getByRole('dialog')
  await expect.element(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect
    .element(dialog.getByRole('link', { name: 'Settings' }))
    .toHaveAttribute('href', '/account')
  await expect.element(dialog.getByText('API keys')).not.toBeInTheDocument()

  const signOut = Array.from(document.querySelectorAll('button')).find(
    button => button.textContent?.trim() === 'Sign out',
  )
  const settings = document.querySelector('a[href="/account"]')

  expect(signOut?.parentElement).toBe(settings?.parentElement)
})
