import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'
import NestedField from './releaseSamplesNestedField.svelte'
import GroupedField from './releaseSamplesGroupedField.svelte'

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
