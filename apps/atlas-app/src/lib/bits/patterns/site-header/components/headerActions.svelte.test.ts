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
