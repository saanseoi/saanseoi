<script lang="ts">
import type { HumanOperation } from '@repo/db/fieldLineageHuman'
type GeographicRule = NonNullable<HumanOperation['rule']>
import { useFieldNavigation } from './provenanceContext'
let { rule }: { rule: Extract<GeographicRule, { kind: 'field-reference' }> } = $props()
const navigation = useFieldNavigation()
let target = $derived(navigation?.target(rule.field, rule.resourceType))
</script>
<aside
  class="space-y-2 rounded-md border border-foreground/15 p-3"
  aria-label="Field dependency"
>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="font-semibold">{rule.label}</span>
    {#if target}
      <button
        type="button"
        class="font-semibold text-secondary underline underline-offset-4"
        onclick={() => navigation?.select(target!)}
      >
        View {rule.resourceType ? `${rule.resourceType}.` : ''}{rule.field}
        lineage →
      </button>
    {:else}
      <span class="text-foreground/60">{rule.field} lineage unavailable</span>
    {/if}
  </div>
  <p class="leading-relaxed text-foreground/65">{rule.description}</p>
</aside>
