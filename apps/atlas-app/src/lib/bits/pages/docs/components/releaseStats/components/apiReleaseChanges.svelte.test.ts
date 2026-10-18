import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Changes from './apiReleaseChanges.svelte'
import { buildSourceReleaseStatsPresentation } from '../../../../../../../routes/sources/[datasetCode]/[releaseCode]/sourceReleasePage.utils'

const remote = vi.hoisted(() => ({ getApiSnapshotChanges: vi.fn() }))
vi.mock('#lib/registry/apiSnapshotChanges.remote.js', () => remote)
afterEach(() => vi.unstubAllGlobals())
const props = {
  resourceLabel: 'Places',
  resourceType: 'place',
  primary: true,
  statistics: [
    ...[
      'count',
      'added_count',
      'changed_count',
      'removed_count',
      'unchanged_count',
    ].map(measure => ({
      category: 'changes',
      measure,
      unit: 'count',
      value: measure === 'count' || measure === 'added_count' ? 3 : 0,
    })),
  ],
  fromSnapshot: 'old',
  toSnapshot: 'new',
  onTypeChange: () => {},
  diff: true,
  locale: 'en' as const,
  presentation: buildSourceReleaseStatsPresentation('en'),
}
const record = (id: string, name: string) => ({
  id,
  type: 'added',
  before: null,
  after: { name },
  fields: [],
})
const ready = (
  records: ReturnType<typeof record>[],
  nextOffset: number | null = null,
) =>
  Object.assign(Promise.resolve(), {
    ready: true,
    current: {
      records,
      nextOffset,
      total: 3,
      counts: { added: 3, changed: 0, removed: 0, unchanged: 0 },
    },
  })

test('API change pagination replaces duplicate IDs and retains existing rows', async () => {
  let intersect!: IntersectionObserverCallback
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
      disconnect() {}
    },
  )
  const first = ready([record('one', 'First record'), record('two', 'Old label')], 2)
  const second = ready([
    record('two', 'Updated label'),
    record('three', 'Third record'),
  ])
  remote.getApiSnapshotChanges.mockImplementation(({ offset }) =>
    offset ? second : first,
  )
  const screen = await render(Changes, props)
  await expect.poll(() => intersect).toBeDefined()
  intersect(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
  await expect
    .element(screen.getByRole('button', { name: /Updated label/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /First record/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /Third record/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /Old label/ }))
    .not.toBeInTheDocument()
})

test('late failures from an abandoned API comparison do not replace the current result', async () => {
  let fail!: (error: Error) => void
  const old = Object.assign(
    new Promise((_, reject) => {
      fail = reject
    }),
    { ready: false },
  )
  const current = ready([record('current', 'Current record')])
  remote.getApiSnapshotChanges.mockImplementation(({ toSnapshot }) =>
    toSnapshot === 'new' ? old : current,
  )
  const screen = await render(Changes, props)
  await screen.rerender({ ...props, toSnapshot: 'latest' })
  await expect
    .element(screen.getByRole('button', { name: /Current record/ }))
    .toBeVisible()
  fail(new Error('Old comparison failed'))
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
})

test('published counts render while record comparison is still pending', async () => {
  remote.getApiSnapshotChanges.mockReturnValue(
    Object.assign(new Promise(() => {}), { ready: false }),
  )
  const screen = await render(Changes, props)
  await expect
    .element(screen.getByRole('heading', { name: /3\s+records/i }))
    .toBeVisible()
})

test('a published zero count does not run a record comparison', async () => {
  remote.getApiSnapshotChanges.mockClear()
  const screen = await render(Changes, {
    ...props,
    statistics: props.statistics.map(row => ({
      ...row,
      value: row.measure === 'count' || row.measure === 'unchanged_count' ? 3 : 0,
    })),
  })
  await expect
    .element(screen.getByRole('heading', { name: /3\s+records/i }))
    .toBeVisible()
  expect(remote.getApiSnapshotChanges).not.toHaveBeenCalled()
})

test('published counts render before the previous release baseline has loaded', async () => {
  const screen = await render(Changes, {
    ...props,
    fromSnapshot: undefined,
    baselineLoading: true,
  })
  await expect
    .element(screen.getByRole('heading', { name: /3\s+records/i }))
    .toBeVisible()
})
