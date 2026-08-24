import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import InlineMarkdown from './releaseSchemaInlineMarkdown.svelte'

test('renders inline Markdown code as a code element', async () => {
  const screen = await render(InlineMarkdown, {
    value: 'The canonical type is `district`.',
  })

  await expect
    .element(screen.getByText('district'))
    .toHaveClass('border-secondary/65', 'font-mono', 'text-secondary')
})
