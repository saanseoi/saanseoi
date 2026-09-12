import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseNavInlineLabel from './releaseNavInlineLabel.svelte'

test('renders inline Markdown code as a code element', async () => {
  const screen = await render(ReleaseNavInlineLabel, {
    label: 'Languages (`I18n`)',
  })

  await expect.element(screen.getByText('I18n')).toHaveClass('font-mono')
})

test('emphasises the supplied leading label segment', async () => {
  const screen = await render(ReleaseNavInlineLabel, {
    emphasis: 'Divisions',
    label: 'Divisions · PlanD · New Town',
  })

  const emphasis = screen.container.querySelector('strong')
  expect(emphasis?.textContent).toBe('Divisions')
  expect(emphasis).toHaveClass('font-semibold')
})

test('title-cases navigation labels and preserves minor words', async () => {
  const screen = await render(ReleaseNavInlineLabel, {
    label: 'Names by locale',
  })

  await expect.element(screen.getByText('Names by Locale')).toBeVisible()
})

test('uses the compact notes and limitations label', async () => {
  const screen = await render(ReleaseNavInlineLabel, {
    label: 'Notes and limitations',
  })

  await expect.element(screen.getByText('Notes & Limitations')).toBeVisible()
})
