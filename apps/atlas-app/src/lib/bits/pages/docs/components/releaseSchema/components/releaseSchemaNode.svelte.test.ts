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

test('keeps descriptions beside an allOf schema reference', async () => {
  const screen = await render(ReleaseSchemaNode, {
    expandedNodeStates: { 'Division.links': true },
    name: 'Division',
    referencePath: ['Division'],
    schema: {
      properties: {
        links: {
          allOf: [
            { $ref: '#/components/schemas/JsonApiLinkMap' },
            { description: 'Links for this division resource.' },
          ],
        },
      },
      type: 'object',
    },
    schemas: {
      JsonApiLinkMap: {
        additionalProperties: { description: 'An additional named link.' },
        properties: {
          self: {
            description: 'The URL of this resource or response.',
            type: 'string',
          },
        },
        type: 'object',
      },
    },
  })

  await expect
    .element(screen.getByText('Links for this division resource.'))
    .toBeVisible()
  await expect
    .element(screen.getByText('The URL of this resource or response.'))
    .toBeVisible()
  await expect.element(screen.getByText('An additional named link.')).toBeVisible()
})

test('flattens a JSON:API data array into its relationship linkage', async () => {
  const screen = await render(ReleaseSchemaNode, {
    name: 'boundaries',
    schema: {
      properties: {
        data: {
          items: {
            properties: {
              id: { type: 'string' },
              type: { const: 'division-boundaries', type: 'string' },
            },
            required: ['id', 'type'],
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['data'],
      type: 'object',
    },
    schemas: {},
  })

  await expect.element(screen.getByText('.data with')).toBeVisible()
  await expect.element(screen.getByText('array', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('id', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByText('items', { exact: true }))
    .not.toBeInTheDocument()
})
