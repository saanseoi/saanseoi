import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'
import NestedField from './releaseSamplesNestedField.svelte'
import GroupedField from './releaseSamplesGroupedField.svelte'
import Identifier from './releaseSamplesIdentifier.svelte'

for (const grouped of [false, true]) {
  test(`${grouped ? 'grouped' : 'individual'} samples collapse nested levels and initially hide geometry`, async () => {
    const field = {
      key: 'attributes',
      children: [
        {
          key: 'geometry',
          children: [{ key: 'type', value: 'MultiPolygon' }],
        },
      ],
    }
    const screen = grouped
      ? await render(GroupedField, {
          sampleIds: ['sample'],
          field: {
            key: 'attributes',
            values: [],
            children: [
              {
                key: 'geometry',
                values: [],
                children: [
                  {
                    key: 'type',
                    values: [{ value: 'MultiPolygon', sampleIds: ['sample'] }],
                    children: [],
                  },
                ],
              },
            ],
          },
        })
      : await render(NestedField, { field })

    await expect.element(screen.getByText('MultiPolygon')).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Expand geometry', exact: true }).click()
    await expect.element(screen.getByText('MultiPolygon')).toBeVisible()
    await screen.getByRole('button', { name: 'Collapse geometry', exact: true }).click()
    await expect.element(screen.getByText('MultiPolygon')).not.toBeInTheDocument()
    await screen
      .getByRole('button', { name: 'Collapse attributes', exact: true })
      .element()
      .focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByText('geometry', { exact: true }))
      .not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByRole('button', { name: 'Expand geometry', exact: true }))
      .toBeVisible()
  })
}

test('grouped samples highlight matching records across nested fields and shared values', async () => {
  const screen = await render(GroupedField, {
    sampleIds: ['first', 'second', 'third'],
    field: {
      key: 'properties',
      values: [],
      children: [
        {
          key: 'id',
          values: [
            { value: 'first', sampleIds: ['first'] },
            { value: 'second', sampleIds: ['second'] },
          ],
          children: [],
        },
        {
          key: 'name',
          values: [
            { value: 'Tai O', sampleIds: ['first'] },
            { value: 'Lai Chi Kok', sampleIds: ['second'] },
            { value: 'Another town', sampleIds: ['third'] },
          ],
          children: [],
        },
        {
          key: 'class',
          values: [
            { value: 'town', sampleIds: ['first', 'third'] },
            { value: 'macrohood', sampleIds: ['second'] },
          ],
          children: [],
        },
      ],
    },
  })
  const value = (text: string) =>
    screen
      .getByText(text, { exact: true })
      .element()
      .closest('[data-sample-ids]') as HTMLElement
  await userEvent.hover(value('Tai O'))
  await expect.element(value('Lai Chi Kok')).toHaveClass('opacity-25')
  await expect.element(value('macrohood')).toHaveClass('opacity-25')
  await expect.element(value('town')).not.toHaveClass('opacity-25')
  await userEvent.hover(value('town'))
  await expect.element(value('Tai O')).not.toHaveClass('opacity-25')
  await expect.element(value('Another town')).not.toHaveClass('opacity-25')
  await expect.element(value('Lai Chi Kok')).toHaveClass('opacity-25')
  await userEvent.unhover(value('town'))
  await expect.element(value('Lai Chi Kok')).not.toHaveClass('opacity-25')
  value('Lai Chi Kok').focus()
  await expect.element(value('Tai O')).toHaveClass('opacity-25')
  await expect.element(value('macrohood')).not.toHaveClass('opacity-25')
  value('Lai Chi Kok').blur()
  await expect.element(value('Tai O')).not.toHaveClass('opacity-25')

  await userEvent.click(value('Tai O'))
  await userEvent.unhover(value('Tai O'))
  value('Tai O').blur()
  await expect.element(value('Tai O')).toHaveAttribute('aria-pressed', 'true')
  await expect.element(value('Lai Chi Kok')).toHaveClass('opacity-25')
  await userEvent.hover(value('macrohood'))
  await expect.element(value('macrohood')).toHaveClass('opacity-25')
  await expect.element(value('Tai O')).not.toHaveClass('opacity-25')

  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  try {
    await screen.getByRole('button', { name: 'second', exact: true }).click()
    expect(writeText).toHaveBeenCalledWith('second')
    await expect.element(value('Tai O')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(value('Lai Chi Kok')).toHaveClass('opacity-25')
  } finally {
    writeText.mockRestore()
  }

  await userEvent.click(value('town'))
  await userEvent.unhover(value('town'))
  value('town').blur()
  await expect.element(value('Another town')).not.toHaveClass('opacity-25')
  await expect.element(value('Lai Chi Kok')).toHaveClass('opacity-25')
  await userEvent.click(value('town'))
  await expect.element(value('town')).toHaveAttribute('aria-pressed', 'false')
  await expect.element(value('Lai Chi Kok')).not.toHaveClass('opacity-25')

  value('Lai Chi Kok').focus()
  await userEvent.keyboard('{Enter}')
  value('Lai Chi Kok').blur()
  await expect.element(value('Tai O')).toHaveClass('opacity-25')
  await expect.element(value('Lai Chi Kok')).toHaveAttribute('aria-pressed', 'true')
})

test('ID success feedback waits for the clipboard, resets, and stays hidden on failure', async () => {
  let finishCopy!: () => void
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finishCopy = resolve
      }),
  )
  try {
    const id = 'complete-sample-record-identifier'
    const screen = await render(Identifier, { id, marker: 'bg-data-primary' })
    const button = screen.getByRole('button', { name: id, exact: true })
    await button.click()
    expect(writeText).toHaveBeenCalledWith(id)
    await expect.element(button).toHaveAttribute('data-copied', 'false')
    finishCopy()
    await expect.element(button).toHaveAttribute('data-copied', 'true')
    await expect.element(button.getByText('Copied')).toBeVisible()
    await expect.element(button).toHaveAttribute('data-copied', 'false')

    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    await button.click()
    await expect.element(screen.getByText('Could not copy ID')).toBeInTheDocument()
    await expect.element(button).toHaveAttribute('data-copied', 'false')
  } finally {
    writeText.mockRestore()
  }
})
