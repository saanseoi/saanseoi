<script lang="ts">
import { onMount, untrack } from 'svelte'
import { createNavigationRequestScope } from '#lib/remote/createNavigationRequestScope.js'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

import { m } from '#lib/bits/internal/i18n.js'
import ReleaseSamplesSkeleton from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesSkeleton.svelte'
import {
  groupAddressSamples,
  type AddressSample,
} from '#lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation.js'
import GroupedField from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesGroupedField.svelte'
import { loadReleaseSamples } from '#lib/bits/pages/docs/components/releaseSamples/loadReleaseSamples.js'

type Props = {
  family: string
  onAvailabilityChange?: (available: boolean) => void
  request: number
  sourceReleaseCode: string
}

type SourceRecordsResponse = { records?: unknown[] }

const apiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)
const initialExamples = 1
const examplesPerRequest = 4

let { family, onAvailabilityChange, request, sourceReleaseCode }: Props = $props()
let samples = $state.raw<AddressSample[]>([])
let activeSampleIds = $state<string[] | null>(null)
let selectedSampleIds = $state<string[] | null>(null)
let loading = $state(false)
let unavailable = $state(false)
let errorMessage = $state<string | null>(null)
let mounted = $state(false)
let handledRequest = $state<number | null>(null)
let pendingExamples = $state(0)
let activeExamples = 0
let loadedScope: string | undefined
const requests = createNavigationRequestScope(() => {
  loading = false
  pendingExamples += activeExamples
  activeExamples = 0
  void loadMore()
})

const groupedFields = $derived(groupAddressSamples(samples))
function requestUrl(limit: number) {
  const url = new URL(`${apiBaseUrl}/${family}/v0.1/sources`)
  url.searchParams.set('sourceRelease', sourceReleaseCode)
  url.searchParams.set('include', 'geometry')
  url.searchParams.set('sample', 'random')
  url.searchParams.set('limit', String(limit))
  return url
}

function toSourceSample(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const sourceRecordId = record.sourceRecordId
  if (typeof sourceRecordId !== 'string' || !sourceRecordId.trim()) return null

  // Keep this as a raw presentation value. getUniqueAddressSamples performs the
  // one conversion to AddressSample below; converting here too turns the
  // renderer's internal `fields` array into a visible record property.
  return {
    id: sourceRecordId,
    ...(family === 'streets'
      ? { resourceType: record.resourceType, variant: record.variant }
      : {}),
    properties: record.properties,
    geometry: record.geometry,
  }
}

async function getRandomRecords(limit: number, signal: AbortSignal) {
  signal.throwIfAborted()
  const response = await fetch(requestUrl(limit), { signal })
  signal.throwIfAborted()
  if (response.status === 404) {
    unavailable = true
    onAvailabilityChange?.(false)
    return []
  }
  if (!response.ok) throw new Error(`Sample request failed with ${response.status}.`)

  const payload = (await response.json()) as SourceRecordsResponse
  signal.throwIfAborted()
  onAvailabilityChange?.(true)
  return (payload.records ?? []).flatMap(value => {
    const sample = toSourceSample(value)
    return sample ? [sample] : []
  })
}

function enqueueExamples(count: number) {
  pendingExamples += count
  void loadMore()
}

async function loadMore() {
  if (loading || unavailable || requests.signal.aborted) return

  const count = pendingExamples
  if (!count) return

  const signal = requests.signal
  activeExamples = count
  loading = true
  pendingExamples = 0
  errorMessage = null
  try {
    const selected = await loadReleaseSamples(
      samples,
      count,
      missing => getRandomRecords(missing, signal),
      signal,
    )
    signal.throwIfAborted()
    if (unavailable) return
    samples = [...samples, ...selected]
  } catch {
    if (!signal.aborted) errorMessage = m.source_record_samples_load_error()
  } finally {
    if (!signal.aborted) {
      activeExamples = 0
      loading = false
      if (!errorMessage && pendingExamples > 0) void loadMore()
    }
  }
}

onMount(() => {
  mounted = true
})

$effect(() => {
  const scope = JSON.stringify([family, sourceReleaseCode])
  if (!mounted || scope === loadedScope) return
  loadedScope = scope
  untrack(() => {
    requests.reset()
    samples = []
    activeSampleIds = null
    selectedSampleIds = null
    loading = false
    unavailable = false
    errorMessage = null
    activeExamples = 0
    pendingExamples = 0
    handledRequest = request
    enqueueExamples(initialExamples)
  })
})

$effect(() => {
  if (!mounted || request === handledRequest) return
  const previousRequest = handledRequest ?? request
  handledRequest = request
  enqueueExamples(Math.max(request - previousRequest, 1) * examplesPerRequest)
})
</script>

<section class="space-y-4" aria-label={m.source_record_samples_aria_label()}>
  {#if unavailable}
    <p class="font-body text-body-md text-foreground-alt">
      {m.source_record_samples_unavailable()}
    </p>
  {:else}
    <div>
      {#if samples.length}
        <div in:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
          <div class="space-y-3">
            <dl
              class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
            >
              {#each groupedFields as field (field.key)}
                <GroupedField
                  {field}
                  bind:activeSampleIds
                  bind:selectedSampleIds
                  label={field.key === 'id' ? 'sourceRecordId' : undefined}
                  sampleIds={samples.map(sample => sample.id)}
                />
              {/each}
            </dl>
          </div>
        </div>
      {:else if mounted && !loading && !errorMessage}
        <p class="font-body text-body-md text-foreground-alt">
          {m.source_record_samples_empty()}
        </p>
      {/if}
    </div>
  {/if}

  {#if !unavailable && (!mounted || (loading && !samples.length))}
    <ReleaseSamplesSkeleton label={m.source_record_samples_loading()} />
  {/if}

  {#if errorMessage}
    <p class="font-body text-body-md text-error" role="alert">{errorMessage}</p>
  {/if}
</section>
