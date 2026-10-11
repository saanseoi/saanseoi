<script lang="ts">
import { untrack } from 'svelte'
import ReleaseSamplesFieldLabel from './releaseSamplesFieldLabel.svelte'
import {
  sampleValueTones,
  type GroupedSampleField,
} from '../releaseSamplesPresentation'
import ReleaseSamplesGroupedField from './releaseSamplesGroupedField.svelte'
import ReleaseSamplesIdentifier from './releaseSamplesIdentifier.svelte'

type Props = {
  depth?: number
  field: GroupedSampleField
  label?: string
  sampleIds: string[]
  activeSampleIds?: string[] | null
  selectedSampleIds?: string[] | null
}

let {
  depth = 0,
  field,
  label,
  sampleIds,
  activeSampleIds = $bindable<string[] | null>(null),
  selectedSampleIds = $bindable<string[] | null>(null),
}: Props = $props()
let expanded = $state(untrack(() => field.key !== 'geometry'))

const highlightedSampleIds = $derived(selectedSampleIds ?? activeSampleIds)

function isSelected(ids: string[]) {
  return (
    selectedSampleIds?.length === ids.length &&
    ids.every(id => selectedSampleIds?.includes(id))
  )
}

function toggleSelection(ids: string[]) {
  selectedSampleIds = isSelected(ids) ? null : ids
  activeSampleIds = null
}

function getTone(sampleId: string) {
  const sampleIndex = sampleIds.indexOf(sampleId)
  return sampleValueTones[(sampleIndex < 0 ? 0 : sampleIndex) % sampleValueTones.length]
}
</script>

<div class="border-t border-outline-variant/55 first:border-t-0">
  <div
    class="grid min-w-0 grid-cols-[minmax(min(60%,var(--sample-label-width)),0.42fr)_minmax(0,1fr)] gap-5 px-4 py-4"
    style:--sample-label-width={`${12 + depth * 1.25}rem`}
  >
    <dt
      class:font-semibold={field.children.length > 0}
      class="min-w-0 font-mono text-label-md text-primary wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      <ReleaseSamplesFieldLabel
        name={label ?? field.key}
        hasChildren={field.children.length > 0}
        bind:expanded
      />
    </dt>
    <dd class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3">
      {#each field.values as entry (entry.value)}
        {#if field.key === 'id'}
          <fieldset
            class="m-0 inline-flex min-w-0 max-w-full border-0 p-0 text-left transition-opacity duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            class:opacity-25={highlightedSampleIds !== null &&
              !entry.sampleIds.some(id => highlightedSampleIds?.includes(id))}
            data-sample-ids={entry.sampleIds.join(' ')}
            onpointerenter={(event: PointerEvent) => {
              if (event.pointerType === 'mouse') activeSampleIds = entry.sampleIds
            }}
            onpointerleave={(event: PointerEvent) => {
              if (event.pointerType === 'mouse') activeSampleIds = null
            }}
            onfocusin={() => {
              activeSampleIds = entry.sampleIds
            }}
            onfocusout={() => {
              activeSampleIds = null
            }}
          >
            <ReleaseSamplesIdentifier
              id={entry.value}
              marker={getTone(entry.sampleIds[0]).marker}
            />
          </fieldset>
        {:else}
          <button
            type="button"
            class="inline-flex min-w-0 max-w-full text-left transition-opacity duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            class:opacity-25={highlightedSampleIds !== null &&
              !entry.sampleIds.some(id => highlightedSampleIds?.includes(id))}
            aria-pressed={isSelected(entry.sampleIds)}
            onclick={() => toggleSelection(entry.sampleIds)}
            data-sample-ids={entry.sampleIds.join(' ')}
            onpointerenter={(event: PointerEvent) => {
              if (event.pointerType === 'mouse') activeSampleIds = entry.sampleIds
            }}
            onpointerleave={(event: PointerEvent) => {
              if (event.pointerType === 'mouse') activeSampleIds = null
            }}
            onfocusin={() => {
              activeSampleIds = entry.sampleIds
            }}
            onfocusout={() => {
              activeSampleIds = null
            }}
          >
            <span
              class="flex min-w-0 max-w-full items-stretch bg-surface-container-low px-3 py-2 font-body text-body-md leading-6 text-foreground-alt wrap-break-word"
              title={entry.sampleIds.join('\n')}
            >
              <span
                class="mr-3 flex shrink-0 items-stretch gap-1 py-0.5"
                aria-hidden="true"
              >
                {#each entry.sampleIds as sampleId (sampleId)}
                  <span class={`w-1.5 self-stretch ${getTone(sampleId).marker}`}></span>
                {/each}
              </span>
              <span class="min-w-0 wrap-break-word">{entry.value}</span>
            </span>
          </button>
        {/if}
      {/each}
    </dd>
  </div>
  {#if field.children.length && expanded}
    <dl class="bg-surface-container-low/60">
      {#each field.children as child (child.key)}
        <ReleaseSamplesGroupedField
          field={child}
          depth={depth + 1}
          {sampleIds}
          bind:activeSampleIds
          bind:selectedSampleIds
        />
      {/each}
    </dl>
  {/if}
</div>
