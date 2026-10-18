import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Changes from './apiReleaseChanges.svelte'
import VariantChanges from './apiReleaseVariantChanges.svelte'
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

test('a zero stored count cannot hide changes between distinct snapshots', async () => {
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
  expect(remote.getApiSnapshotChanges).toHaveBeenCalled()
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

test('identical snapshots skip comparison even when stored statistics are inconsistent', async () => {
  remote.getApiSnapshotChanges.mockClear()
  const screen = await render(Changes, { ...props, fromSnapshot: 'new' })
  await expect
    .element(screen.getByRole('heading', { name: /3\s+records/i }))
    .toBeVisible()
  expect(remote.getApiSnapshotChanges).not.toHaveBeenCalled()
})

test('All compares each variant with its matching baseline without borrowing primary counts', async () => {
  remote.getApiSnapshotChanges.mockClear()
  remote.getApiSnapshotChanges.mockImplementation(({ toSnapshot }) =>
    ready([record(toSnapshot, `Record from ${toSnapshot}`)]),
  )
  const resource = (variant: string, snapshotId: string, role: string) => ({
    variant,
    snapshotId,
    role,
    snapshot: { id: snapshotId, code: snapshotId, resourceType: 'address' },
  })
  const screen = await render(VariantChanges, {
    ...props,
    resourceLabel: 'Addresses',
    resources: [
      resource('hkgov-dpo', 'gov-new', 'primary'),
      resource('overture-places', 'overture-new', 'supplementary'),
    ],
    previousResources: [
      resource('overture-places', 'overture-old', 'supplementary'),
      resource('hkgov-dpo', 'gov-old', 'primary'),
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: /Record from gov-new/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /Record from overture-new/ }))
    .toBeVisible()
  expect(remote.getApiSnapshotChanges).toHaveBeenCalledWith(
    expect.objectContaining({ fromSnapshot: 'gov-old', toSnapshot: 'gov-new' }),
  )
  expect(remote.getApiSnapshotChanges).toHaveBeenCalledWith(
    expect.objectContaining({
      fromSnapshot: 'overture-old',
      toSnapshot: 'overture-new',
    }),
  )
  await expect.element(screen.getByRole('heading')).not.toBeInTheDocument()
  await expect.element(screen.getByText('No matching changes.')).not.toBeInTheDocument()
  expect(document.querySelectorAll('section[aria-label="Changes"]')).toHaveLength(1)
})

test('mixed pagination retains records with the same ID in different variants', async () => {
  let intersect!: IntersectionObserverCallback
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  remote.getApiSnapshotChanges.mockImplementation(({ toSnapshot, offset }) =>
    offset
      ? ready([record(`${toSnapshot}-next`, `Next ${toSnapshot}`)])
      : ready([record('shared-id', `First ${toSnapshot}`)], 1),
  )
  const screen = await render(Changes, {
    ...props,
    comparisons: [
      { fromSnapshot: 'gov-old', toSnapshot: 'gov-new' },
      { fromSnapshot: 'overture-old', toSnapshot: 'overture-new' },
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: /First gov-new/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /First overture-new/ }))
    .toBeVisible()
  intersect(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
  await expect
    .element(screen.getByRole('button', { name: /Next gov-new/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /Next overture-new/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /First gov-new/ }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: /First overture-new/ }))
    .toBeVisible()
})

test('an unchanged variant cannot add an empty state above another variant records', async () => {
  remote.getApiSnapshotChanges.mockReturnValue(
    ready([record('one', 'Supplementary record')]),
  )
  const screen = await render(Changes, {
    ...props,
    comparisons: [
      { fromSnapshot: 'same', toSnapshot: 'same' },
      { fromSnapshot: 'old', toSnapshot: 'new' },
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: /Supplementary record/ }))
    .toBeVisible()
  await expect.element(screen.getByText('No matching changes.')).not.toBeInTheDocument()
})
