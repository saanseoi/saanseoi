import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import SourceRecordSamples from './sourceRecordSamples.svelte'

vi.hoisted(() => {
  Object.assign(globalThis, {
    __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
  })
})

test('shows a skeleton while source samples are pending', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
  try {
    const screen = await render(SourceRecordSamples, {
      family: 'divisions',
      request: 0,
      sourceReleaseCode: 'dr-hk-overture-division-2026-08-19.0',
    })
    await expect.element(screen.getByRole('status')).toBeVisible()
    await expect
      .element(screen.getByRole('status'))
      .toHaveAttribute('aria-busy', 'true')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('renders the first source record without fetching surplus candidates', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        records: [
          {
            rawProperties: { name: 'Example division' },
            resourceType: 'division',
            sourceRecordId: 'record-1',
            variant: 'default',
          },
        ],
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)

  const screen = await render(SourceRecordSamples, {
    family: 'divisions',
    request: 0,
    sourceReleaseCode: 'dr-hk-overture-division-2026-08-19.0',
  })

  await expect.element(screen.getByText('record-1')).toBeVisible()
  await expect.element(screen.getByText('resourceType')).toBeVisible()
  await expect.element(screen.getByText('division')).toBeVisible()
  await expect.element(screen.getByText('variant')).toBeVisible()
  await expect.element(screen.getByText('default')).toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Collapse rawProperties' }))
    .toBeVisible()
  await expect.element(screen.getByText('name')).toBeVisible()
  await expect.element(screen.getByText('Example division')).toBeVisible()
  await expect.element(screen.getByText('fields')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.stringContaining('limit=1'),
    }),
  )
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.not.stringContaining('include=geometry'),
    }),
  )
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.stringContaining('sample=random'),
    }),
  )

  vi.unstubAllGlobals()
})

test('keeps the first sample in place while more samples load', async () => {
  let resolveMore: ((response: Response) => void) | undefined
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          records: [
            {
              rawProperties: { name: 'First record' },
              resourceType: 'division',
              sourceRecordId: 'record-1',
              variant: 'default',
            },
          ],
        }),
      ),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveMore = resolve
        }),
    )
  vi.stubGlobal('fetch', fetch)

  try {
    const screen = await render(SourceRecordSamples, {
      family: 'divisions',
      request: 0,
      sourceReleaseCode: 'dr-hk-overture-division-2026-08-19.0',
    })
    await expect.element(screen.getByText('record-1')).toBeVisible()

    await screen.rerender({
      family: 'divisions',
      request: 1,
      sourceReleaseCode: 'dr-hk-overture-division-2026-08-19.0',
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    await expect.element(screen.getByText('record-1')).toBeVisible()
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument()
    const table = screen.container.querySelector('dl')!
    const top = table.getBoundingClientRect().top
    resolveMore?.(
      new Response(
        JSON.stringify({
          records: [2, 3, 4, 5].map(index => ({
            sourceRecordId: `record-${index}`,
            resourceType: 'division',
            variant: 'default',
            rawProperties: { name: `Record ${index}` },
          })),
        }),
      ),
    )
    await expect.element(screen.getByText('record-5')).toBeVisible()
    expect(screen.container.querySelector('dl')).toBe(table)
    expect(table.getBoundingClientRect().top).toBe(top)
    expect(screen.container.querySelectorAll('section > div > div')).toHaveLength(1)
  } finally {
    resolveMore?.(new Response(JSON.stringify({ records: [] })))
    vi.unstubAllGlobals()
  }
})
