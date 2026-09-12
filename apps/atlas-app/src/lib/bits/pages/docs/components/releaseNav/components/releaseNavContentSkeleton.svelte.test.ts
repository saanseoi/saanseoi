import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseNavContentSkeleton from './releaseNavContentSkeleton.svelte'

test('uses the shared record skeleton for Samples', async () => {
  const screen = await render(ReleaseNavContentSkeleton, { tab: 'samples' })

  await expect.element(screen.getByRole('status')).toBeVisible()
  await expect.element(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  await expect.element(screen.getByRole('status')).toHaveClass('space-y-4')
})

test('uses a schema-shaped skeleton for Schema', async () => {
  const screen = await render(ReleaseNavContentSkeleton, { tab: 'schema' })

  await expect.element(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  await expect
    .element(screen.getByRole('status'))
    .toHaveAttribute('aria-label', 'Loading schema')
  await expect
    .element(screen.getByText('Fuzzy find an address, ID, source file, or decision'))
    .not.toBeInTheDocument()
})
