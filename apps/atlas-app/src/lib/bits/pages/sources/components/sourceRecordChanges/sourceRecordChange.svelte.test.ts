import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import SourceRecordChange from './sourceRecordChange.svelte'

test('records start collapsed and changed fields use previous/current columns', async () => {
  const before = { names: { en: 'Old name', zh: '不變' }, unchanged: 'Hidden value' }
  const after = { names: { en: 'New name', zh: '不變' }, unchanged: 'Hidden value' }
  const screen = await render(SourceRecordChange, {
    id: 'division-1',
    type: 'changed',
    before,
    after,
    fields: jsonFieldDiff(before, after),
    locale: 'en',
  })
  const summary = screen.getByRole('button', { name: /New name/ })
  await expect.element(summary).toHaveAttribute('aria-expanded', 'false')
  await expect
    .element(screen.getByText('Previous', { exact: true }))
    .not.toBeInTheDocument()
  await summary.click()
  await expect.element(screen.getByText('Previous', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Current', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Old name', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByText('Hidden value', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByText('不變', { exact: true }))
    .not.toBeInTheDocument()
  await summary.click()
  await expect
    .element(screen.getByText('Previous', { exact: true }))
    .not.toBeInTheDocument()
})

for (const type of ['added', 'removed'] as const) {
  test(`${type} records use a single value column`, async () => {
    const value = { name: 'Test village', properties: { retained: 'Record detail' } }
    const screen = await render(SourceRecordChange, {
      id: 'division-2',
      type,
      before: type === 'removed' ? value : null,
      after: type === 'added' ? value : null,
      fields: [],
      locale: 'en',
    })
    await screen.getByRole('button', { name: /Record/ }).click()
    await expect
      .element(screen.getByText('Record detail', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Previous', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Not present', { exact: true }))
      .not.toBeInTheDocument()
  })
}

test('full-record mode includes unchanged values', async () => {
  const screen = await render(SourceRecordChange, {
    id: 'division-3',
    type: 'changed',
    before: { value: 'Old' },
    after: { value: 'New', retained: 'Full detail' },
    fields: [],
    locale: 'en',
    diff: false,
  })
  await screen.getByRole('button', { name: /Record/ }).click()
  await expect.element(screen.getByText('Full detail', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Not present', { exact: true })).toBeVisible()
})

test('bulk field expansion reflects manual collapse and expands hidden descendants', async () => {
  const screen = await render(SourceRecordChange, {
    id: 'nested',
    type: 'removed',
    before: {
      properties: { name: 'Village', nested: { value: 'Detail' } },
      geometry: { type: 'Point', coordinates: [1, 2] },
    },
    after: null,
    fields: [],
    locale: 'en',
  })
  await screen.getByRole('button', { name: /Village/ }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Expand All', exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Expand All', exact: true }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Collapse All', exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Collapse nested', exact: true }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Expand All', exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Expand All', exact: true }).click()
  await expect.element(screen.getByText('Detail', { exact: true })).toBeVisible()
  await screen.getByRole('button', { name: 'Collapse All', exact: true }).click()
  await expect
    .element(screen.getByText('Detail', { exact: true }))
    .not.toBeInTheDocument()
  await screen.getByRole('button', { name: 'Expand All', exact: true }).click()
  await expect.element(screen.getByText('Detail', { exact: true })).toBeVisible()
})

test('language-matched changes hide shifted unchanged translations', async () => {
  const before = {
    rules: [
      { language: 'ko', value: 'Unchanged Korean' },
      { language: 'es', value: 'Old Spanish' },
    ],
  }
  const after = {
    rules: [
      { language: 'ja', value: 'New Japanese' },
      { language: 'ko', value: 'Unchanged Korean' },
      { language: 'es', value: 'New Spanish' },
    ],
  }
  const screen = await render(SourceRecordChange, {
    id: 'translations',
    type: 'changed',
    before,
    after,
    fields: jsonFieldDiff(before, after),
    locale: 'en',
  })
  await screen.getByRole('button', { name: /Record/ }).click()
  await expect
    .element(screen.getByText('Unchanged Korean', { exact: true }))
    .not.toBeInTheDocument()
  await expect.element(screen.getByText('Old Spanish', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('New Spanish', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('New Japanese', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('es', { exact: true }).first()).toBeVisible()
  expect(screen.getByText('es', { exact: true }).all()).toHaveLength(2)
})

test('changed tags flatten properties and copying the ID keeps the record collapsed', async () => {
  const before = {
    properties: {
      name: 'Village',
      sources: [{ id: 'old', version: 1 }],
      wikidata: null,
    },
    geometry: { coordinates: [1, 2] },
  }
  const after = {
    properties: {
      name: 'Village',
      sources: [{ id: 'new', version: 2 }],
      wikidata: 'Q123',
    },
    geometry: { coordinates: [3, 4] },
  }
  let copied = ''
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })
  try {
    const screen = await render(SourceRecordChange, {
      id: 'record-id',
      type: 'changed',
      before,
      after,
      fields: jsonFieldDiff(before, after),
      locale: 'en',
      diff: false,
    })
    const summary = screen.getByRole('button', { name: /Village/ })
    for (const key of ['sources', 'wikidata', 'geometry']) {
      await expect.element(screen.getByText(key, { exact: true })).toBeVisible()
    }
    await expect
      .element(screen.getByText('properties', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('record-id', { exact: true }))
      .not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Copy ID', exact: true }).click()
    expect(copied).toBe('record-id')
    await expect.element(screen.getByRole('status')).toHaveTextContent('ID copied')
    await expect.element(summary).toHaveAttribute('aria-expanded', 'false')
    const copyButton = screen.getByRole('button', { name: 'Copy ID', exact: true })
    const collapsedX = copyButton.element().getBoundingClientRect().x
    await summary.click()
    expect(copyButton.element().getBoundingClientRect().x).toBe(collapsedX)
    await expect
      .poll(() => screen.getByRole('status').element().textContent?.trim(), {
        timeout: 3500,
      })
      .toBe('')
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})
