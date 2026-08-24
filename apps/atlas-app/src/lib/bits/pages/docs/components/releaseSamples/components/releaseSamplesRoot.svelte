<script lang="ts">
import { onMount } from 'svelte'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import type { ApiProfileName } from '@repo/core'
import {
  getSampleApiPath,
  groupAddressSamples,
  getUniqueAddressSamples,
  sampleValueTones,
  supportsReleaseSamples,
  type AddressSample,
} from '../releaseSamplesPresentation'
import NestedField from './releaseSamplesNestedField.svelte'
import GroupedField from './releaseSamplesGroupedField.svelte'

type Props = {
  apiVersion: string
  apiFamily: string
  profile: ApiProfileName
  releaseSet: string
  request: number
  sampleCount?: number
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
const candidatesPerRequest = 10

let {
  apiVersion,
  apiFamily,
  profile,
  releaseSet,
  request,
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
    if (loadedReleaseSet !== releaseSet) {
      samples = []
      sampleCount = 0
      view = 'distinct'
      total = null
      loadedReleaseSet = `${releaseSet}:${profile}`
    }

    if (total === null) {
      const firstPage = await getPage(0, 1)
      const value = firstPage.meta?.page?.total
      total = typeof value === 'number' && value >= 0 ? value : 0
    }
    if (!total) return

    const selected: AddressSample[] = []
    const maximumOffset = Math.max(total - candidatesPerRequest, 0)
    for (let attempt = 0; attempt < 4 && selected.length < count; attempt += 1) {
      const offsets = new Set<number>()
      while (offsets.size < count) {
        offsets.add(Math.floor(Math.random() * (maximumOffset + 1)))
        if (maximumOffset === 0) break
      }
      const pages = await Promise.all(
        [...offsets].map(offset => getPage(offset, candidatesPerRequest)),
      )
      selected.push(
        ...getUniqueAddressSamples(
          pages.flatMap(page => page.data ?? []),
          [...samples, ...selected],
        ).slice(0, count - selected.length),
      )
    }
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
      A random full record from this release set. Null fields are omitted and subsequent
      examples are deduplicated.
    </p>

    {#if samples.length && view === 'grouped'}
      <div class="space-y-3">
        <fieldset class="flex flex-wrap gap-2">
          <legend class="sr-only">Sample value legend</legend>
          {#each samples as sample, index (sample.id)}
            <span
              class={`border-l-[0.375rem] px-2 py-1 font-mono text-label-sm text-foreground ${sampleValueTones[index % sampleValueTones.length].border} ${sampleValueTones[index % sampleValueTones.length].surface}`}
            >
              {sample.id}
            </span>
          {/each}
        </fieldset>
        <dl
          class="overflow-hidden border border-data-outline-variant/60 bg-data-surface-container-lowest"
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
            class="overflow-hidden border border-data-outline-variant/60 bg-data-surface-container-lowest"
          >
            <dt>
              <button
                class="grid w-full min-w-0 grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-4 bg-data-surface-container-low px-4 py-3 text-left"
                type="button"
                aria-expanded={!collapsedSamples.has(sample.id)}
                onclick={() => toggleSample(sample.id)}
              >
                <span class="font-mono text-label-sm font-semibold text-foreground-alt"
                  >id</span
                >
                <span
                  class="min-w-0 font-mono text-body-sm leading-6 text-primary wrap-break-word"
                >
                  {sample.id}
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
    {:else if !loading && !errorMessage}
      <p class="font-body text-body-md text-foreground-alt">
        No complete {apiFamily} samples are available for this release set and profile.
      </p>
    {/if}

    {#if errorMessage}
      <p class="font-body text-body-md text-error" role="alert">{errorMessage}</p>
    {/if}
  </section>
{/if}
