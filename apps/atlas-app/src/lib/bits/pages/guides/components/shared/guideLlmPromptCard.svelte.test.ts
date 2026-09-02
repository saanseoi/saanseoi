import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import GuideLlmPromptCard from './guideLlmPromptCard.svelte'

test('takes hidden references out of the prompt card layout', async () => {
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

  const card = screen.container.querySelector(
    '[data-guide-llm-prompt-card]',
  ) as HTMLElement
  const hiddenReference = card.querySelectorAll('section')[1] as HTMLElement

  expect(hiddenReference.classList).toContain('absolute')
})
