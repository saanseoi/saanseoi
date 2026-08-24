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

test('wraps a JSON:API data array as explicit relationship linkage', async () => {
  const screen = await render(ReleaseSchemaNode, {
    name: 'boundaries',
    schema: {
      properties: {
        data: {
          description: 'The related resources.',
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

  await expect.element(screen.getByText('data', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('array', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('The related resources.')).toBeVisible()
  await expect.element(screen.getByText('id', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByText('items', { exact: true }))
    .not.toBeInTheDocument()
})

test('keeps the key layer of a string-keyed map explicit', async () => {
  const screen = await render(ReleaseSchemaNode, {
    name: 'i18n',
    schema: {
      additionalProperties: { $ref: '#/components/schemas/DivisionI18nAttributes' },
      type: 'object',
      'x-recordKeyName': 'en, zh-hant, …',
    },
    schemas: {
      DivisionI18nAttributes: {
        properties: { name: { type: 'string' } },
        type: 'object',
      },
    },
  })

  await expect
    .element(screen.getByText('en, zh-hant, …', { exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Expand en, zh-hant, …' }).click()
  await expect.element(screen.getByText('name', { exact: true })).toBeVisible()
})

test('uses a schema-provided label for additional properties', async () => {
  const screen = await render(ReleaseSchemaNode, {
    name: 'sources',
    schema: {
      additionalProperties: {
        description: 'A provider-specific source item.',
        type: 'array',
      },
      type: 'object',
      'x-additionalPropertiesName': 'another source provider',
    },
    schemas: {},
  })

  await expect
    .element(screen.getByText('another source provider', { exact: true }))
    .toBeVisible()
})

test('shows the variants of a nullable referenced union', async () => {
  const screen = await render(ReleaseSchemaNode, {
    name: 'geometry',
    schema: {
      anyOf: [{ $ref: '#/components/schemas/DivisionGeometry' }, { type: 'null' }],
    },
    schemas: {
      DivisionGeometry: {
        anyOf: [
          {
            description: 'A single position.',
            properties: { type: { const: 'Point', type: 'string' } },
            type: 'object',
          },
          {
            description: 'One enclosed area.',
            properties: { type: { const: 'Polygon', type: 'string' } },
            type: 'object',
          },
        ],
      },
    },
  })

  await expect.element(screen.getByText('Point', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Polygon', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('A single position.')).toBeVisible()
  await expect.element(screen.getByText('One enclosed area.')).toBeVisible()
})
