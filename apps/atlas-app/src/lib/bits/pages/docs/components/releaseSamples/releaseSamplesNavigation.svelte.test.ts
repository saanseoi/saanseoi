import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import ApiSamples from './components/releaseSamplesRoot.svelte'
import SourceSamples from '../../../../../../routes/sources/[datasetCode]/[releaseCode]/sourceRecordSamples.svelte'

const navigation = vi.hoisted(() => ({
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
}))
vi.mock('$app/navigation', () => navigation)
afterEach(() => vi.unstubAllGlobals())

for (const kind of ['source', 'api'] as const) {
  const sourceProps = { family: 'divisions', sourceReleaseCode: 'old', request: 0 }
  const apiProps = {
    apiVersion: 'api-divisions-v0.2',
    apiFamily: 'divisions',
    domainCode: 'hk',
    profile: 'full' as const,
    releaseSet: 'old',
    request: 0,
  }
  const mount = () =>
    kind === 'source'
      ? render(SourceSamples, sourceProps)
      : render(ApiSamples, apiProps)
  const response = (ids: string[]) =>
    Response.json(
      kind === 'source'
        ? { records: ids.map(id => ({ sourceRecordId: id, properties: { name: id } })) }
        : { data: ids.map(id => ({ id, name: id })) },
    )
  const pendingRequests = () => {
    const requests: {
      url: URL
      signal: AbortSignal
      finish: (response: Response) => void
    }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: URL, { signal }: RequestInit) =>
          new Promise<Response>(finish => {
            requests.push({ url, signal: signal!, finish })
          }),
      ),
    )
    return requests
  }

  test(`${kind} samples cancel on navigation, resume retained components, and ignore stale results`, async () => {
    const requests = pendingRequests()
    const screen = await mount()
    await expect.poll(() => requests.length).toBe(1)
    const from = { url: new URL('http://atlas.localhost/sources/dataset/old') }
    navigation.beforeNavigate.mock.lastCall![0]({
      from,
      to: { url: new URL(`${from.url.href}#field`) },
    })
    expect(requests[0].signal.aborted).toBe(false)
    navigation.beforeNavigate.mock.lastCall![0]({
      from,
      to: { url: new URL('http://atlas.localhost/sources/dataset/new') },
    })
    expect(requests[0].signal.aborted).toBe(true)
    navigation.afterNavigate.mock.lastCall![0]()
    await expect.poll(() => requests.length).toBe(2)
    requests[1].finish(response(['current-sample']))
    await expect.element(screen.getByText('current-sample').first()).toBeVisible()
    requests[0].finish(response(['stale-sample']))
    await expect.element(screen.getByText('stale-sample')).not.toBeInTheDocument()
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
    expect(requests).toHaveLength(2)
  })

  test(`${kind} samples replace pending work when the release changes`, async () => {
    const requests = pendingRequests()
    const screen = await mount()
    await expect.poll(() => requests.length).toBe(1)
    await screen.rerender(
      kind === 'source'
        ? { ...sourceProps, sourceReleaseCode: 'new' }
        : { ...apiProps, releaseSet: 'new' },
    )
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[0].signal.aborted).toBe(true)
    expect(
      requests[1].url.searchParams.get(
        kind === 'source' ? 'sourceRelease' : 'releaseSet',
      ),
    ).toBe('new')
    requests[1].finish(response(['new-sample']))
    await expect.element(screen.getByText('new-sample').first()).toBeVisible()
    requests[0].finish(new Response(null, { status: 500 }))
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
    await screen.unmount()
    expect(requests[1].signal.aborted).toBe(true)
  })

  test(`${kind} samples retain queued requests while loading and cancel on unmount`, async () => {
    const requests = pendingRequests()
    const screen = await mount()
    await expect.poll(() => requests.length).toBe(1)
    await screen.rerender(
      kind === 'source' ? { ...sourceProps, request: 2 } : { ...apiProps, request: 2 },
    )
    expect(requests).toHaveLength(1)
    requests[0].finish(response(['first-sample']))
    await expect.poll(() => requests.length).toBe(2)
    expect(
      requests[1].url.searchParams.get(kind === 'source' ? 'limit' : 'page[limit]'),
    ).toBe('8')
    await screen.unmount()
    expect(requests[1].signal.aborted).toBe(true)
    requests[1].finish(response(['ignored']))
    expect(requests).toHaveLength(2)
  })
}
