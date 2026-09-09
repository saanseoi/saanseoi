<script lang="ts">
import { onMount } from 'svelte'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import type { ApiProfileName } from '@repo/core/apiLocales'
import {
  getSampleApiPath,
  getSamplePageOffsets,
  groupAddressSamples,
  sampleValueTones,
  supportsReleaseSamples,
  type AddressSample,
} from '../releaseSamplesPresentation'
import NestedField from './releaseSamplesNestedField.svelte'
import GroupedField from './releaseSamplesGroupedField.svelte'
import ReleaseSamplesIdentifier from './releaseSamplesIdentifier.svelte'
import ReleaseSamplesSkeleton from './releaseSamplesSkeleton.svelte'
import { loadReleaseSamples } from '../loadReleaseSamples'

type Props = {
  apiVersion: string
  apiFamily: string
  domainCode: string
  profile: ApiProfileName
  releaseSet: string
  request: number
  sampleCount?: number
  recordCount?: number | null
  view?: 'distinct' | 'grouped'
}

type AddressListResponse = {
  data?: unknown[]
  meta?: { page?: { total?: unknown } }
}

const apiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)
const initialExamples = 1
const examplesPerRequest = 4

let {
  apiVersion,
  apiFamily,
  domainCode,
  profile,
  releaseSet,
  request,
  recordCount = null,
  sampleCount = $bindable(0),
  view = $bindable<'distinct' | 'grouped'>('distinct'),
}: Props = $props()
let samples = $state<AddressSample[]>([])
let collapsedSamples = $state<Set<string>>(new Set())
let loading = $state(false)
let errorMessage = $state<string | null>(null)
let total = $state<number | null>(null)
let loadedReleaseSet = $state<string | null>(null)
let mounted = $state(false)
let handledRequest = $state<number | null>(null)

const supported = $derived(supportsReleaseSamples(apiVersion))
const groupedFields = $derived(groupAddressSamples(samples))
const apiPath = $derived(getSampleApiPath(apiVersion))

function requestUrl(offset: number, limit: number) {
  if (!apiPath) throw new Error('Samples are not available for this API version.')
  const url = new URL(`${apiBaseUrl}${apiPath}`)
  url.searchParams.set('releaseSet', releaseSet)
  url.searchParams.set('domain', domainCode)
  url.searchParams.set('profile', profile)
  url.searchParams.set('locales', profile === 'full' ? '*' : 'en,zh-hant')
  url.searchParams.set('page[limit]', String(limit))
  url.searchParams.set('page[offset]', String(offset))
  return url
}

async function getPage(offset: number, limit: number) {
  const response = await fetch(requestUrl(offset, limit))
  if (!response.ok) throw new Error(`Sample request failed with ${response.status}.`)
  return (await response.json()) as AddressListResponse
}

async function loadMore(count: number) {
  if (!supported || loading) return

  loading = true
  errorMessage = null
  try {
    const target = `${releaseSet}:${profile}`
    if (loadedReleaseSet !== target) {
      samples = []
      sampleCount = 0
      view = 'distinct'
      total = recordCount
      loadedReleaseSet = target
    }

    const selected = await loadReleaseSamples(samples, count, async missing => {
      if (total === 0) return []
      if (total === null) {
        const firstPage = await getPage(samples.length, missing)
        const value = firstPage.meta?.page?.total
        total = typeof value === 'number' && value >= 0 ? value : null
        return firstPage.data ?? []
      }
      const offsets = getSamplePageOffsets(Math.max(total - 1, 0), missing)
      const pages = await Promise.all(offsets.map(offset => getPage(offset, 1)))
      return pages.flatMap(page => page.data ?? [])
    })
    samples = [...samples, ...selected]
    sampleCount = samples.length
    if (samples.length > 1) view = 'grouped'
  } catch {
    errorMessage = 'Examples could not be loaded. Please try again.'
  } finally {
    loading = false
  }
}

onMount(() => {
  mounted = true
  handledRequest = request
  void loadMore(initialExamples)
})

function toggleSample(id: string) {
  const next = new Set(collapsedSamples)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedSamples = next
}

$effect(() => {
  if (!mounted || request === handledRequest) return
  handledRequest = request
  void loadMore(examplesPerRequest)
})
</script>

{#if !supported}
  <p class="px-5 pt-3 font-body text-body-md text-foreground-alt">
    Samples are not yet available for this API version.
  </p>
{:else}
  <section class="space-y-4" aria-label="Random API samples">
    <p class="font-body text-body-md text-foreground-alt">
      A random {profile} record from this release set. Null fields are omitted and
      subsequent examples are deduplicated.
    </p>

    {#if samples.length && view === 'grouped'}
      <div class="space-y-3">
        <dl
          class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
        >
          {#each groupedFields as field (field.key)}
            <GroupedField {field} sampleIds={samples.map(sample => sample.id)} />
          {/each}
        </dl>
      </div>
    {:else if samples.length}
      <div class="grid gap-3">
        {#each samples as sample (sample.id)}
          <dl
            class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
          >
            <dt>
              <button
                class="grid w-full min-w-0 grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 bg-surface-container-low px-4 py-4 text-left transition hover:bg-surface-container"
                type="button"
                aria-expanded={!collapsedSamples.has(sample.id)}
                onclick={() => toggleSample(sample.id)}
              >
                <span class="font-mono text-label-md font-semibold text-primary"
                  >id</span
                >
                <span class="min-w-0">
                  <ReleaseSamplesIdentifier
                    id={sample.id}
                    marker={sampleValueTones[0].marker}
                  />
                </span>
              </button>
            </dt>
            {#if !collapsedSamples.has(sample.id)}
              {#each sample.fields as field (field.key)}
                <NestedField {field} />
              {/each}
            {/if}
          </dl>
        {/each}
      </div>
    {:else if mounted && !loading && !errorMessage}
      <p class="font-body text-body-md text-foreground-alt">
        No complete {apiFamily} samples are available for this release set and profile.
      </p>
    {/if}

    {#if !mounted || loading}
      <ReleaseSamplesSkeleton />
    {/if}

    {#if errorMessage}
      <p class="font-body text-body-md text-error" role="alert">{errorMessage}</p>
    {/if}
  </section>
{/if}
