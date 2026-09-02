import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import GuideLlmPromptCard from './guideLlmPromptCard.svelte'

test('sizes itself to the visible prompt instead of a hidden reference', async () => {
  const screen = await render(GuideLlmPromptCard, {
    prompt: 'Add the basemap.',
    references: [
      {
        code: Array.from(
          { length: 40 },
          (_, index) => `const line${index} = true`,
        ).join('\n'),
        language: 'typescript',
        path: 'src/main.ts',
        title: 'Long reference',
        type: 'TS',
      },
    ],
    title: 'Set up basemap',
  })

  const card = screen.container.firstElementChild as HTMLElement
  const promptBlock = card.querySelector('section > div') as HTMLElement

  expect(
    Math.abs(
      card.getBoundingClientRect().height - promptBlock.getBoundingClientRect().height,
    ),
  ).toBeLessThan(1)
})
