<script lang="ts">
import type {
  LineageDefinition,
  Node,
  ReleaseBinding,
} from '@repo/db/fieldLineageTypes'
import Rule from './releaseProvenanceRule.svelte'
import { humanOperation, fieldName, visibleNodeTitle } from './humanPresentation'
let {
  node,
  humanOverride,
  definition,
  scopeLabels,
}: {
  node: Node
  humanOverride?: import('@repo/db/fieldLineageHuman').HumanOperation
  definition: LineageDefinition
  references?: Map<string, string>
  scopeLabels: Record<string, string>
  pin?: ReleaseBinding['scopes'][number]
} = $props()
let human = $derived(humanOverride ?? humanOperation(node, definition))
function inputLabel(input: Node['inputs'][string]) {
  if ('node' in input) {
    const producer = definition.nodes.find(value => value.id === input.node)
    return {
      label: producer
        ? visibleNodeTitle(producer, definition)
        : 'Source value unavailable',
      target: producer?.id,
      description: '',
    }
  }
  if ('group' in input) {
    const group = definition.resolutionGroups.find(value => value.id === input.group)
    return {
      label: group ? fieldName(group.output.path) : 'Source value unavailable',
      description: 'From the applicable source below',
    }
  }
  return { label: fieldName(input.path), description: scopeLabels[input.scope] ?? '' }
}
</script>
<div class="space-y-4 border-t border-foreground/10 pt-4 text-sm">
  {#if human}
    <p class="leading-relaxed text-foreground/80">{human.description}</p>
  {:else}
    <p class="text-foreground/65">
      A field-specific explanation of this transformation has not been retained. Its
      known inputs are shown below.
    </p>
  {/if}
  {#each human?.detailRules ?? [] as rule}
    <Rule {rule} />
  {/each}
  {#if Object.values(node.inputs).filter(input => input.role === 'value').length > 1}
    <section aria-label="Derived from" class="rounded-lg bg-foreground/5 p-3">
      <h5 class="mb-2 text-xs font-semibold text-foreground/60">Derived from</h5>
      <ul class="space-y-2">
        {#each Object.values(node.inputs).filter(
          input => input.role === 'value',
        ) as input}
          {@const value = inputLabel(input)}
          <li>
            <span class="font-medium">{value.label}</span>
            {#if value.description}
              <span class="block text-xs text-foreground/60">{value.description}</span>
            {/if}
          </li>
        {:else}
          <li>No source value required.</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if node.onAbsent === 'null' ||
    node.onAbsent === 'omit' ||
    node.onAbsent === 'empty-array'}
    <p class="text-xs text-foreground/60">
      When no value is available:
      {node.onAbsent === 'null'
        ? 'return null.'
        : node.onAbsent === 'omit'
          ? 'leave this field out.'
          : 'return an empty list.'}
    </p>
  {/if}
</div>
