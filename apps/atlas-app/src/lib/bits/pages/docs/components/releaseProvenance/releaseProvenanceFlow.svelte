<script lang="ts">
import type { HumanSourceUse } from '@repo/db/fieldLineageHuman'
import { isTransportNode, retainedOperation } from './humanPresentation'
import type { LineageDefinition, ReleaseBinding } from '@repo/db/fieldLineageTypes'
import {
  reverseFieldFlow,
  type ReverseBranch,
} from './presentation'
import FieldDependency from './releaseProvenanceFieldDependency.svelte'
import Preparation from './releaseProvenancePreparation.svelte'
import ProvenanceNode from './releaseProvenanceNode.svelte'
import Condition from './releaseProvenanceCondition.svelte'
import Source from './releaseProvenanceSource.svelte'
let {
  definition,
  terminalNode,
  scopeLabels,
  binding,
  onSelectField,
}: {
  definition: LineageDefinition
  terminalNode: string
  scopeLabels: Record<string, string>
  binding: ReleaseBinding | null
  onSelectField: (terminalNode: string) => void
} = $props()
let trace = $derived(reverseFieldFlow(definition, terminalNode))
function preparationRun(item: ReverseBranch) {
  const nodes: Extract<ReverseBranch, {kind:'node'}>[] = []
  const sources: ReverseBranch[] = []
  let current: ReverseBranch | undefined = item
  while (current?.kind === 'node' && current.node.stage === 'preparation') {
    nodes.push(current)
    const next: ReverseBranch[] = current.children.filter(child => child.kind !== 'source')
    sources.push(...current.children.filter(child => child.kind === 'source'))
    if (next.length !== 1) { sources.push(...next); current = undefined } else current = next[0]
  }
  if (current) sources.push(current)
  return {nodes, sources}
}
</script>
{#snippet branch(
  item: ReverseBranch,
  inheritedSources: HumanSourceUse[] = [],
)}
  {@const run = preparationRun(item)}
  {#if run.nodes.length > 3}
    <Preparation>
      {#each run.nodes as entry}
        {#if !isTransportNode(entry.node, definition)}
          <ProvenanceNode node={entry.node} humanOverride={entry.human} {definition} {binding} {scopeLabels} reference={entry.reference} references={trace.references} />
        {/if}
      {/each}
    </Preparation>
    <div class="ml-5 h-4 border-l border-foreground/25"></div>
    {#each run.sources as source}{@render branch(source, inheritedSources)}{/each}
  {:else if item.kind === 'node'}
    {@const uses =
      (
        retainedOperation(item.node, definition).human as
          | { sources?: HumanSourceUse[] }
          | undefined
      )?.sources ?? inheritedSources}
    {#if !isTransportNode(item.node, definition)}
      <ProvenanceNode
        node={item.node}
        humanOverride={item.human}
        {definition}
        {binding}
        {scopeLabels}
        reference={item.reference}
        references={trace.references}
      />
    {/if}
    {#if item.children.length}
      <div>
        <div class="ml-5 h-4 border-l border-foreground/25"></div>
        {#each item.children as child}
          {@render branch(child, uses)}
        {/each}
      </div>
    {/if}
  {:else if item.kind === 'choice'}
    <section aria-label="Conditional sources" class="space-y-3">
      <div class="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
        <h4 class="text-sm font-semibold">Select the applicable source</h4>
        <p class="mt-1 text-xs text-foreground/60">
          The conditions below determine which source supplies this value.
        </p>
      </div>
      <div class="ml-2 border-l border-primary/30 pl-3">
        {#each item.children as child}
          <div class="relative pb-4 last:pb-0">
            <span class="absolute -left-3 top-3 w-3 border-t border-primary/30"></span>
            {#if child.kind === 'node'}
              <p class="mb-2 text-xs leading-6">
                <Condition {definition} condition={child.node.when} labels={scopeLabels} />
              </p>
            {/if}
            {@render branch(child)}
          </div>
        {/each}
      </div>
    </section>
  {:else if item.kind === 'source'}
    <Source uses={inheritedSources} input={item.input} {scopeLabels} {binding} />
  {:else if item.kind === 'field'}
    <FieldDependency field={item.field} {onSelectField} />
  {:else if item.kind === 'reference'}
    <p class="py-2 text-xs text-foreground/60">
      Also uses
      <a class="underline underline-offset-4" href={`#provenance-node-${item.id}`}
        >{definition.nodes.find(node => node.id === item.id)?.output.path ??
          'the source above'}</a
      >
    </p>
  {:else}
    <p class="rounded-lg border border-foreground/15 p-3 text-sm">
      Upstream lineage unavailable
    </p>
  {/if}
{/snippet}
<div class="space-y-3">
  <div aria-label="Value flow">{@render branch(trace.root)}</div>
</div>
