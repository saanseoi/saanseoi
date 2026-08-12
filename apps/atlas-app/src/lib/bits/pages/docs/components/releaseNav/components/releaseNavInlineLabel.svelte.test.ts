import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseNavInlineLabel from './releaseNavInlineLabel.svelte'

test('renders inline Markdown code as a code element', async () => {
  const screen = await render(ReleaseNavInlineLabel, {
    label: 'Languages (`I18n`)',
  })

  await expect.element(screen.getByText('I18n')).toHaveClass('font-mono')
})
