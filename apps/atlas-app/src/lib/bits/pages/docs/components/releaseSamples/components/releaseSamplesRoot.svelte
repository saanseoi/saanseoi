<script lang="ts">
import { onMount } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import type { ApiProfileName } from '@repo/core/apiLocales'
import {
  getSampleApiPath,
  getSamplePageOffsets,
  getReleaseSampleLoadErrorMessage,
  groupAddressSamples,
  sampleValueTones,
  supportsReleaseSamples,
  type AddressSample,
} from '../releaseSamplesPresentation'
import NestedField from './releaseSamplesNestedField.svelte'
import GroupedField from './releaseSamplesGroupedField.svelte'
import ReleaseSamplesIdentifier from './releaseSamplesIdentifier.svelte'
import ReleaseSamplesSkeleton from './releaseSamplesSkeleton.svelte'
import { loadAddressSample, loadReleaseSamples } from '../loadReleaseSamples'

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
type SamplePresentation = 'grouped' | 'individual' | null

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
const samplePresentation = $derived<SamplePresentation>(
  samples.length && view === 'grouped'
    ? 'grouped'
    : samples.length
      ? 'individual'
      : null,
)

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

async function getPage(offset: number, limit: number, after?: string) {
  const url = requestUrl(offset, limit)
  if (after !== undefined) url.searchParams.set('page[after]', after)
  const response = await fetch(url)
  const body = (await response.json()) as unknown
  if (!response.ok)
    throw new Error(getReleaseSampleLoadErrorMessage(response.status, body))
  return body as AddressListResponse
}

async function loadMore(count: number) {
  if (!supported || loading) return

  if (samples.length) view = 'grouped'
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
      if (apiVersion === 'api-addresses-v0.1') {
        const pages = await Promise.all(
          Array.from({ length: missing }, () =>
            loadAddressSample(async after => (await getPage(0, 1, after)).data ?? []),
          ),
        )
        return pages.flat()
      }
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
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : 'Examples could not be loaded. Please try again.'
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

    <div>
      {#if samplePresentation === 'grouped'}
        <div in:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
          <div class="space-y-3">
            <dl
              class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
            >
              {#each groupedFields as field (field.key)}
                <GroupedField {field} sampleIds={samples.map(sample => sample.id)} />
              {/each}
            </dl>
          </div>
        </div>
      {:else if samplePresentation === 'individual'}
        <div in:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
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
        </div>
      {:else if mounted && !loading && !errorMessage}
        <p class="font-body text-body-md text-foreground-alt">
          No complete {apiFamily} samples are available for this release set and
          profile.
        </p>
      {/if}
    </div>

    {#if !mounted || (loading && !samples.length)}
      <ReleaseSamplesSkeleton />
    {/if}

    {#if errorMessage}
      <p class="font-body text-body-md text-error" role="alert">{errorMessage}</p>
    {/if}
  </section>
{/if}
