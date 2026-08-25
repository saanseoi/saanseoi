<script lang="ts">
import { onMount } from 'svelte'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

import { m } from '#lib/bits/internal/i18n.js'
import NestedField from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesNestedField.svelte'
import SourceIdentifier from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesIdentifier.svelte'
import {
  getUniqueAddressSamples,
  groupAddressSamples,
  sampleValueTones,
  toCompleteSample,
  type AddressSample,
} from '#lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation.js'
import GroupedField from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesGroupedField.svelte'

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
const candidatesPerRequest = 10

let { family, onAvailabilityChange, request, sourceReleaseCode }: Props = $props()
let samples = $state<AddressSample[]>([])
let collapsedSamples = $state<Set<string>>(new Set())
let loading = $state(false)
let unavailable = $state(false)
let errorMessage = $state<string | null>(null)
let mounted = $state(false)
let handledRequest = $state<number | null>(null)
let pendingExamples = $state(0)

const groupedFields = $derived(groupAddressSamples(samples))

function requestUrl(limit: number) {
  const url = new URL(`${apiBaseUrl}/${family}/v0.1/sources`)
  url.searchParams.set('sourceRelease', sourceReleaseCode)
  url.searchParams.set('sample', 'random')
  url.searchParams.set('include', 'geometry')
  url.searchParams.set('limit', String(limit))
  return url
}

function toSourceSample(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const sourceRecordId = record.sourceRecordId
  if (typeof sourceRecordId !== 'string' || !sourceRecordId.trim()) return null

  return toCompleteSample({
    geometry: record.geometry,
    id: sourceRecordId,
    rawProperties: record.rawProperties,
    resourceType: record.resourceType,
    variant: record.variant,
  })
}

async function getRandomRecords(limit: number) {
  const response = await fetch(requestUrl(limit))
  if (response.status === 404) {
    unavailable = true
    onAvailabilityChange?.(false)
    return []
  }
  if (!response.ok) throw new Error(`Sample request failed with ${response.status}.`)

  onAvailabilityChange?.(true)

  const payload = (await response.json()) as SourceRecordsResponse
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
  if (loading || unavailable) return

  const count = pendingExamples
  if (!count) return

  loading = true
  pendingExamples = 0
  errorMessage = null
  try {
    const selected: AddressSample[] = []
    for (let attempt = 0; attempt < 4 && selected.length < count; attempt += 1) {
      const candidates = await getRandomRecords(candidatesPerRequest)
      selected.push(
        ...getUniqueAddressSamples(candidates, [...samples, ...selected]).slice(
          0,
          count - selected.length,
        ),
      )
      if (unavailable) return
    }
    samples = [...samples, ...selected]
  } catch {
    errorMessage = m.source_record_samples_load_error()
  } finally {
    loading = false
    if (!errorMessage && pendingExamples > 0) void loadMore()
  }
}

function toggleSample(id: string) {
  const next = new Set(collapsedSamples)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedSamples = next
}

onMount(() => {
  mounted = true
  handledRequest = request
  enqueueExamples(initialExamples)
})

$effect(() => {
  if (!mounted || request === handledRequest) return
  const previousRequest = handledRequest ?? request
  handledRequest = request
  enqueueExamples(Math.max(request - previousRequest, 1) * examplesPerRequest)
})
</script>

<section class="space-y-4" aria-label={m.source_record_samples_aria_label()}>
  <p class="font-body text-body-md text-foreground-alt">
    {m.source_record_samples_intro()} <code>rawProperties</code>.
  </p>

  {#if unavailable}
    <p class="font-body text-body-md text-foreground-alt">
      {m.source_record_samples_unavailable()}
    </p>
  {:else if samples.length > 1}
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
      {#each samples as sample, index (sample.id)}
        <div class="overflow-x-auto rounded-md">
          <dl
            class="min-w-176 overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
          >
            <dt>
              <button
                class="grid w-full min-w-0 grid-cols-[minmax(13rem,0.36fr)_minmax(0,1fr)] gap-5 bg-surface-container-low px-4 py-4 text-left transition hover:bg-surface-container"
                type="button"
                aria-expanded={!collapsedSamples.has(sample.id)}
                onclick={() => toggleSample(sample.id)}
              >
                <span class="font-mono text-label-md font-semibold text-primary"
                  >sourceRecordId</span
                >
                <span class="min-w-0">
                  <SourceIdentifier
                    id={sample.id}
                    marker={sampleValueTones[index % sampleValueTones.length].marker}
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
        </div>
      {/each}
    </div>
  {:else if !loading && !errorMessage}
    <p class="font-body text-body-md text-foreground-alt">
      {m.source_record_samples_empty()}
    </p>
  {/if}

  {#if errorMessage}
    <p class="font-body text-body-md text-error" role="alert">{errorMessage}</p>
  {/if}
</section>
