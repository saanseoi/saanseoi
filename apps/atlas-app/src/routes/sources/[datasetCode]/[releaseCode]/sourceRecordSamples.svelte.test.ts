import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import SourceRecordSamples from './sourceRecordSamples.svelte'

vi.hoisted(() => {
  Object.assign(globalThis, {
    __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
  })
})

test('renders the first source record without fetching surplus candidates', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        records: [
          {
            geometry: { coordinates: [114.2, 22.3], type: 'Point' },
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
  await expect.element(screen.getByText('rawProperties')).toBeVisible()
  await expect.element(screen.getByText('name')).toBeVisible()
  await expect.element(screen.getByText('Example division')).toBeVisible()
  await expect.element(screen.getByText('geometry')).toBeVisible()
  await expect.element(screen.getByText('coordinates')).toBeVisible()
  await expect.element(screen.getByText('fields')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.stringContaining('limit=1'),
    }),
  )
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.stringContaining('sample=random'),
    }),
  )

  vi.unstubAllGlobals()
})
