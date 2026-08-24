<script lang="ts">
import {
  sampleValueTones,
  type GroupedSampleField,
} from '../releaseSamplesPresentation'
import ReleaseSamplesGroupedField from './releaseSamplesGroupedField.svelte'
import ReleaseSamplesIdentifier from './releaseSamplesIdentifier.svelte'

type Props = {
  depth?: number
  field: GroupedSampleField
  sampleIds: string[]
}

let { depth = 0, field, sampleIds }: Props = $props()

function getTone(sampleId: string) {
  const sampleIndex = sampleIds.indexOf(sampleId)
  return sampleValueTones[(sampleIndex < 0 ? 0 : sampleIndex) % sampleValueTones.length]
}
</script>

<div class="border-t border-outline-variant/55 first:border-t-0">
  <div
    class="grid min-w-0 grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 px-4 py-4"
  >
    <dt
      class:font-semibold={field.children.length > 0}
      class="min-w-0 font-mono text-label-md text-primary wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      {field.key}
    </dt>
    <dd class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3">
      {#each field.values as entry (entry.value)}
        {#if field.key === 'id'}
          <ReleaseSamplesIdentifier
            id={entry.value}
            marker={getTone(entry.sampleIds[0]).marker}
          />
        {:else}
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
        {/if}
      {/each}
    </dd>
  </div>
  {#if field.children.length}
    <dl class="bg-surface-container-low/60">
      {#each field.children as child (child.key)}
        <ReleaseSamplesGroupedField field={child} depth={depth + 1} {sampleIds} />
      {/each}
    </dl>
  {/if}
</div>
