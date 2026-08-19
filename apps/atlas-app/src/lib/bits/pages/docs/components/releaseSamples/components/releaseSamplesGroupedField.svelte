<script lang="ts">
import {
  sampleValueTones,
  type GroupedSampleField,
} from '../releaseSamplesPresentation'
import ReleaseSamplesGroupedField from './releaseSamplesGroupedField.svelte'

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

<div class="border-t border-data-outline-variant/50 first:border-t-0">
  <div class="grid min-w-0 grid-cols-[minmax(0,0.3fr)_minmax(0,1fr)] gap-5 px-4 py-3">
    <dt
      class:font-semibold={field.children.length > 0}
      class="min-w-0 font-mono text-label-sm text-foreground-alt wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      {field.key}
    </dt>
    <dd class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3">
      {#each field.values as entry (entry.value)}
        {@const shared = entry.sampleIds.length > 1}
        {@const tone = getTone(entry.sampleIds[0])}
        <span
          class={`flex min-w-0 max-w-full items-stretch px-3 py-2 font-body text-body-md leading-6 text-foreground wrap-break-word ${shared ? '' : `border-l-[0.375rem] ${tone.border} ${tone.surface}`}`}
          title={entry.sampleIds.join('\n')}
        >
          {#if shared}
            <span
              class="mr-3 flex shrink-0 items-stretch gap-1 py-0.5"
              aria-hidden="true"
            >
              {#each entry.sampleIds as sampleId (sampleId)}
                <span class={`w-1.5 self-stretch ${getTone(sampleId).marker}`}></span>
              {/each}
            </span>
          {/if}
          <span class="min-w-0 wrap-break-word">{entry.value}</span>
        </span>
      {/each}
    </dd>
  </div>
  {#if field.children.length}
    <dl class="bg-data-surface-container-low/40">
      {#each field.children as child (child.key)}
        <ReleaseSamplesGroupedField field={child} depth={depth + 1} {sampleIds} />
      {/each}
    </dl>
  {/if}
</div>
