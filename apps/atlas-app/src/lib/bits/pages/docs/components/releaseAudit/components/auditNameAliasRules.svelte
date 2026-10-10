<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject } from './auditDivisionPresentation'
import Results from './auditNameAliasResults.svelte'
import RuleMappings from './auditRuleMappings.svelte'
let { entries, query = '' }: { entries: Json[]; query?: string } = $props()
let rows = $derived(
  entries.map(entry => {
    const definition = auditObject(auditObject(entry).definition)
    const result = auditObject(auditObject(entry).ruleResult)
    return {
      id: String(result.id ?? 'name-alias'),
      precedence: 1,
      ...(typeof result.matched === 'number'
        ? { matched: result.matched, changed: Number(result.changed) }
        : {}),
      locale: String(definition.locale ?? ''),
      condition: `“${String(definition.suffix ?? '').trim()}” suffix`,
      result: `Add alias with “${String(definition.replacement ?? '').trim()}” suffix`,
    }
  }),
)
</script>

<RuleMappings
  title="Name alias rules"
  explanation="Keep the original name and add the alternative suffix."
  {rows}
  getRule={async () => ({ entries })}
>
  {#snippet footer()}
    <Results {entries} {query} />
  {/snippet}
</RuleMappings>
