<script lang="ts">
import type { FeatureDiagnostic } from '../../../../../../../diagnostics'
import type { ViewerText } from '../../../i18n'

let {
  layer,
  text,
}: {
  layer: FeatureDiagnostic['layers'][number]
  text: ViewerText
} = $props()

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const entries = (properties: Record<string, unknown>) => Object.entries(properties)
</script>

<section
  class="grid gap-1.5 border-t border-(--bar-divider) pt-2 first:border-t-0 first:pt-0"
>
  <div class="flex min-w-0 items-baseline justify-between gap-2">
    <strong class="truncate text-[12px]">{layer.id}</strong>
    {#if layer.sourceLayer}
      <span class="shrink-0 font-mono text-[10px] text-(--bar-muted)">
        {layer.sourceLayer}
      </span>
    {/if}
  </div>
  {#if entries(layer.properties).length}
    <dl
      class="m-0 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 border-l-2 border-(--bar-divider) pl-2 text-[12px] leading-[1.3]"
    >
      {#each entries(layer.properties) as [key, value]}
        <dt class="truncate text-(--bar-muted)" title={key}>{key}</dt>
        <dd class="m-0 break-words font-mono" title={formatValue(value)}>
          {formatValue(value)}
        </dd>
      {/each}
    </dl>
  {:else}
    <span class="text-[12px] text-(--bar-muted)">{text.noFeatureProperties}</span>
  {/if}
</section>
