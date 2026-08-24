import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseSchemaNode from './releaseSchemaNode.svelte'

test('expands every schema branch when given a new expand-all token', async () => {
  const onExpandAll = vi.fn()
  const screen = await render(ReleaseSchemaNode, {
    expandAllToken: 1,
    name: 'Division',
    onExpandAll,
    schema: {
      properties: {
        attributes: {
          properties: { type: { type: 'string' } },
          type: 'object',
        },
      },
      type: 'object',
    },
    schemas: {},
  })

  await expect.element(screen.getByText('type', { exact: true })).toBeVisible()
  await screen.getByRole('button', { name: 'Expand all' }).click()
  expect(onExpandAll).toHaveBeenCalledOnce()
})
