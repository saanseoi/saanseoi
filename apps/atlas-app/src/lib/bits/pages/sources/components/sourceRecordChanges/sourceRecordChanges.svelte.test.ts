import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Changes from './sourceRecordChanges.svelte'
import { buildSourceReleaseStatsPresentation } from '../../../../../../routes/sources/[datasetCode]/[releaseCode]/sourceReleasePage.utils'

const navigation = vi.hoisted(() => ({
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
}))
vi.mock('$app/navigation', () => navigation)

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
    measure: `${key}_count`,
    value: key === 'removed' ? removed : key === 'unchanged' ? 10 : 0,
  })),
]
afterEach(() => vi.unstubAllGlobals())

test('returning to the same mounted release restarts aborted requests and clears loading', async () => {
  const requests: { signal: AbortSignal; finish: (response: Response) => void }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      (_url: string, { signal }: RequestInit) =>
        new Promise<Response>(finish => {
          requests.push({ signal: signal!, finish })
        }),
    ),
  )
  const screen = await render(Changes, { ...props, sourceTheme: 'stats' })
  await expect.poll(() => requests.length).toBe(2)
  navigation.beforeNavigate.mock.lastCall![0]({
    from: { url: new URL('http://atlas.localhost/sources/dataset/current') },
    to: { url: new URL('http://atlas.localhost/sources/dataset/older') },
  })
  expect(requests.every(request => request.signal.aborted)).toBe(true)
  // Navigation returns to the current release without changing component props.
  navigation.afterNavigate.mock.lastCall![0]()
  await expect.poll(() => requests.length).toBe(4)
  for (const request of requests.slice(2)) {
    request.finish(
      Response.json({ records: [], nextCursor: null, summary: { removed_count: 1 } }),
    )
  }
  await expect.element(screen.getByText('No matching changes.')).toBeVisible()
  await expect
    .element(screen.getByRole('status', { name: 'Loading changes…' }))
    .not.toBeInTheDocument()
  // Late completions from the abandoned request cannot overwrite the new result.
  for (const request of requests.slice(0, 2))
    request.finish(new Response(null, { status: 500 }))
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
})

test('leaving a release aborts records and summary before unmount and allows the next request', async () => {
  const requests: { signal: AbortSignal; finish: (response: Response) => void }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      (_url: string, { signal }: RequestInit) =>
        new Promise<Response>(finish => {
          requests.push({ signal: signal!, finish })
        }),
    ),
  )
  const screen = await render(Changes, { ...props, sourceTheme: 'stats' })
  await expect.poll(() => requests.length).toBe(2)
  const navigate = navigation.beforeNavigate.mock.lastCall![0]
  const from = { url: new URL('http://atlas.localhost/sources/dataset/old') }
  // In-page anchors do not cancel the current release's requests.
  navigate({ from, to: { url: new URL(`${from.url.href}#details`) } })
  expect(requests.every(request => !request.signal.aborted)).toBe(true)
  navigate({ from, to: { url: new URL('http://atlas.localhost/sources/dataset/new') } })
  expect(requests.every(request => request.signal.aborted)).toBe(true)

  // Keep the old promises unresolved while loading another release.
  await screen.rerender({ ...props, sourceTheme: 'stats', toRelease: 'next' })
  await expect.poll(() => requests.length).toBe(4)
  expect(requests.slice(2).every(request => !request.signal.aborted)).toBe(true)
  for (const request of requests.slice(2)) {
    request.finish(
      Response.json({ records: [], nextCursor: null, summary: { removed_count: 1 } }),
    )
  }
  await expect.element(screen.getByText('No matching changes.')).toBeVisible()
  for (const request of requests.slice(0, 2)) {
    request.finish(new Response(null, { status: 500 }))
  }
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
})

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

test('scrolling near the end loads one batch at a time and failures require retry', async () => {
  let intersect!: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        if (options?.rootMargin === '300px 0px') intersect = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  const records = Array.from({ length: 25 }, (_, index) => ({
    sourceRecordId: `record-${index}`,
    type: 'removed',
    before: { name: `Village ${index}` },
    after: null,
    fields: [],
  }))
  let fail!: (reason: Error) => void
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ records, nextCursor: 'page-2' }))
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    .mockResolvedValueOnce(
      Response.json({
        records: [
          { ...records[0], sourceRecordId: 'last', before: { name: 'Last village' } },
        ],
        nextCursor: null,
      }),
    )
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, props)
  await expect.poll(() => intersect).toBeDefined()
  expect(fetch).toHaveBeenCalledTimes(1)
  const nearEnd = () =>
    intersect(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  nearEnd()
  nearEnd()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('cursor')).toBe(
    'page-2',
  )
  await expect
    .element(screen.getByRole('status', { name: 'Loading changes…' }))
    .toBeVisible()
  fail(new Error('network failure'))
  await expect.element(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  nearEnd()
  expect(fetch).toHaveBeenCalledTimes(2)
  await screen.getByRole('button', { name: 'Retry' }).click()
  await expect
    .element(screen.getByRole('button', { name: /Last village/ }))
    .toBeInTheDocument()
  nearEnd()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(disconnect).toHaveBeenCalled()
  await expect
    .element(screen.getByRole('button', { name: 'Load more' }))
    .not.toBeInTheDocument()
})

test('statistical compilations show retained source counts and district-year labels rather than processed area counts', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) =>
    new URL(url).searchParams.get('view') === 'summary'
      ? Response.json({
          records: [],
          nextCursor: null,
          summary: {
            count: 180,
            added_count: 162,
            changed_count: 0,
            removed_count: 0,
            unchanged_count: 18,
          },
        })
      : Response.json({
          records: [
            {
              sourceRecordId: 'A:1',
              type: 'added',
              before: null,
              after: {
                properties: {
                  dcZhHant: '中西區',
                  dcEn: 'Central and Western',
                  year: '2016',
                },
              },
              fields: [],
            },
          ],
          nextCursor: null,
        }),
  )
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, {
    ...props,
    family: 'divisions',
    sourceTheme: 'stats',
    resourceType: 'divisionArea',
    type: undefined,
    stats: [
      { category: 'changes', measure: 'count', value: 18 },
      { category: 'changes', measure: 'added_count', value: 18 },
    ],
  })
  await expect
    .element(screen.getByRole('heading', { name: '180 records' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Added: 162', exact: true }))
    .toBeVisible()
  await expect
    .element(
      screen.getByRole('button', {
        name: '中西區 Central and Western - 2016 Added',
        exact: true,
      }),
    )
    .toBeVisible()
  await expect
    .element(screen.getByRole('heading', { name: '18 records' }))
    .not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a failed source summary never substitutes a processed geometry count', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async (url: string) =>
      new URL(url).searchParams.get('view') === 'summary'
        ? new Response(null, { status: 500 })
        : Response.json({ records: [], nextCursor: null }),
    )
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, { ...props, family: 'stats', stats: stats(3) })
  await expect
    .element(
      screen.getByText(
        'Source record counts are unavailable. Processed resource counts use a different unit.',
      ),
    )
    .toBeVisible()
  await expect
    .element(screen.getByRole('heading', { name: '10 records' }))
    .not.toBeInTheDocument()
})

test('census Areas replace processed changed counts with retained additions and removals', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) =>
    new URL(url).searchParams.get('view') === 'summary'
      ? Response.json({
          records: [],
          nextCursor: null,
          summary: {
            count: 18,
            added_count: 18,
            changed_count: 0,
            removed_count: 18,
            unchanged_count: 0,
          },
        })
      : Response.json({ records: [], nextCursor: null }),
  )
  vi.stubGlobal('fetch', fetch)
  const screen = await render(Changes, {
    ...props,
    family: 'divisions',
    sourceTheme: 'stats',
    resourceType: 'divisionArea',
    type: undefined,
    stats: [
      { category: 'changes', measure: 'count', value: 18 },
      { category: 'changes', measure: 'added_count', value: 0 },
      { category: 'changes', measure: 'changed_count', value: 18 },
      { category: 'changes', measure: 'removed_count', value: 0 },
      { category: 'changes', measure: 'unchanged_count', value: 0 },
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: 'Added: 18', exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Removed: 18', exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Changed: 0', exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Changed: 18', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('heading', { name: '18 records', exact: true }))
    .toBeVisible()
})
