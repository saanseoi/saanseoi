import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Changes from './sourceRecordChanges.svelte'
import { buildSourceReleaseStatsPresentation } from '../../../../../../routes/sources/[datasetCode]/[releaseCode]/sourceReleasePage.utils'

const props = {
  family: 'divisions',
  fromRelease: 'old',
  toRelease: 'new',
  resourceType: 'division',
  type: 'removed' as const,
  locale: 'en' as const,
  onTypeChange: () => {},
  presentation: buildSourceReleaseStatsPresentation('en'),
}
const stats = (removed: number) => [
  { category: 'changes', measure: 'count', value: 10 },
  ...['added', 'changed', 'removed', 'unchanged'].map(key => ({
    category: 'changes',
    measure: key + '_count',
    value: key === 'removed' ? removed : key === 'unchanged' ? 10 : 0,
  })),
]
afterEach(() => vi.unstubAllGlobals())

test('persisted zero counts skip record requests and show no failures or retries', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('unexpected record request'))
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, { ...props, stats: stats(0) })
  await expect.element(screen.getByText('No matching changes.')).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
  await expect
    .element(screen.getByRole('button', { name: 'Retry' }))
    .not.toBeInTheDocument()
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
})

test('loading uses skeletons and hides pagination until the batch settles', async () => {
  let finish!: (response: Response) => void
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        records: [
          {
            sourceRecordId: 'one',
            type: 'removed',
            before: { name: 'First record' },
            after: null,
            fields: [],
          },
        ],
        nextCursor: 'next',
      }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve
        }),
    )
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, { ...props, stats: stats(2) })
  await expect
    .element(screen.getByRole('button', { name: /First record/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('status', { name: 'Loading changes…' }))
    .toBeVisible()
  await expect
    .element(screen.getByText('Loading changes…', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: 'Load more' }))
    .not.toBeInTheDocument()
  finish(Response.json({ records: [], nextCursor: null }))
  await expect
    .element(screen.getByRole('status', { name: 'Loading changes…' }))
    .not.toBeInTheDocument()
})

test('shows persisted counts and requests records directly', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ records: [], nextCursor: null }))
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, { ...props, stats: stats(3) })
  await expect
    .element(screen.getByRole('button', { name: 'Removed: 3', exact: true }))
    .toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('view')).toBeNull()
})

test('missing counts still request records', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ records: [], nextCursor: null }))
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, props)
  await expect.element(screen.getByText('No matching changes.')).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
})
