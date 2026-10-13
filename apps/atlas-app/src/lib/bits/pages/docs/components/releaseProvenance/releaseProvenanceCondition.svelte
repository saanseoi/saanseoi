<script lang="ts">
import type { Condition, LineageDefinition } from '@repo/db/fieldLineageTypes'
import { conditionLabel, valueLabel } from './presentation'
let {
  condition,
  labels = {},
  definition,
}: {
  condition: Condition
  labels?: Record<string, string>
  definition?: LineageDefinition
} = $props()
</script>
{#snippet show(
  value: Condition,
)}
  {#if value.kind === 'all' || value.kind === 'any'}
    {#each value.conditions as child, i}
      {#if i}
        {value.kind === 'all' ? 'and' : 'or'}
      {/if}
      {#if child.kind === 'all' || child.kind === 'any'}
        ({@render show(child)})
      {:else}
        {@render show(child)}
      {/if}
    {/each}
  {:else if value.kind === 'not'}
    Unless ({@render show(value.condition)})
  {:else if value.kind === 'compare'}
    {value.input === 'selectedSource' ? 'Source' : value.input}
    {{ eq: 'is', in: 'is one of', exists: 'is present', matches: 'matches' }[
      value.operator
    ]}
    {#each Array.isArray(value.value)
      ? value.value
      : value.value === undefined
        ? []
        : [value.value] as term}
      <span
        class="inline-flex rounded bg-secondary-container mx-0.5 px-1.5 py-0.5 font-semibold text-on-secondary-container"
        >{typeof term === 'string' ? (labels[term] ?? term) : valueLabel(term)}</span
      >
    {/each}
  {:else if value.kind === 'predicate'}
    {@const rule = definition?.definitions[value.definition.definitionId] as
      | {
          human?: { title: string }
          id?: string
          localeKey?: string
          apiField?: string
        }
      | undefined}
    {#if rule?.id === 'division-response-field' && rule.localeKey}
      This language is requested and has a primary name
    {:else if rule?.id === 'division-response-field' &&
      rule.apiField?.startsWith('relationships.')}
      The related {rule.apiField.endsWith('areas') ? 'areas' : 'boundaries'} collection
      is included
    {:else if rule?.id === 'division-response-field' &&
      rule.apiField === 'attributes.divisionCode'}
      A Division code is available
    {:else}
      {rule?.human
        ? `Matches: ${rule.human.title}`
        : 'The retained field-specific rule applies'}
    {/if}
  {:else}
    {conditionLabel(value, labels)}
  {/if}
{/snippet}
<span>{@render show(condition)}</span>
