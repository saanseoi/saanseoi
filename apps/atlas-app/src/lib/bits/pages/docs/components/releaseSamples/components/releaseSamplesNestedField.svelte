<script lang="ts">
import { untrack } from 'svelte'
import ReleaseSamplesFieldLabel from './releaseSamplesFieldLabel.svelte'
import type { ReleaseSampleField } from '../releaseSamplesPresentation'
import ReleaseSamplesNestedField from './releaseSamplesNestedField.svelte'

type Props = {
  expansion?: Record<string, boolean>
  onExpansionChange?: (id: string, expanded: boolean) => void
  path?: string[]
  comparison?: boolean
  depth?: number
  field: ReleaseSampleField
}

let {
  depth = 0,
  field,
  comparison = false,
  expansion,
  onExpansionChange,
  path = [],
}: Props = $props()
let localExpanded = $state(untrack(() => field.key !== 'geometry'))
const fieldPath = $derived([...path, field.key])
const fieldId = $derived(JSON.stringify(fieldPath))
const expanded = $derived(
  expansion ? (expansion[fieldId] ?? field.key !== 'geometry') : localExpanded,
)
</script>

<div class="border-t border-outline-variant/55 first:border-t-0">
  <div
    class={`grid min-w-0 ${comparison ? 'grid-cols-[minmax(10rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-[minmax(min(60%,var(--sample-label-width)),0.42fr)_minmax(0,1fr)]'} gap-5 px-4 py-4`}
    style:--sample-label-width={`${12 + depth * 1.25}rem`}
  >
    <dt
      class:font-semibold={field.children?.length}
      class="min-w-0 font-mono text-label-md text-primary wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      <ReleaseSamplesFieldLabel
        name={field.key}
        hasChildren={Boolean(field.children?.length)}
        bind:expanded={
          () => expanded,
          value => {
  if (onExpansionChange) onExpansionChange(fieldId, value)
  else localExpanded = value
}
        }
      />
    </dt>
    {#if comparison}
      <dd
        class="min-w-0 font-body text-body-md leading-6 text-foreground-alt wrap-break-word"
      >
        {field.previousValue ?? ''}
      </dd>
    {/if}
    <dd
      class="min-w-0 font-body text-body-md leading-6 text-foreground-alt wrap-break-word"
    >
      {#if field.value !== undefined}
        {field.value}
      {/if}
    </dd>
  </div>
  {#if field.children?.length && expanded}
    <dl class="bg-surface-container-low/60">
      {#each field.children as child (child.key)}
        <ReleaseSamplesNestedField
          field={child}
          depth={depth + 1}
          {comparison}
          {expansion}
          {onExpansionChange}
          path={fieldPath}
        />
      {/each}
    </dl>
  {/if}
</div>
