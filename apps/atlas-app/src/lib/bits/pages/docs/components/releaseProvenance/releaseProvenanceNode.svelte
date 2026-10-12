<script lang="ts">
import { Collapsible } from 'bits-ui'
import type {
  LineageDefinition,
  Node,
  ReleaseBinding,
} from '@repo/db/fieldLineageTypes'
import { nodeStageLabel } from './presentation'
import Condition from './releaseProvenanceCondition.svelte'
import { visibleNodeTitle, humanOperation } from './humanPresentation'
import Rule from './releaseProvenanceRule.svelte'
import ProvenanceDetails from './releaseProvenanceDetails.svelte'
let {
  node,
  humanOverride,
  definition,
  references,
  scopeLabels,
  binding,
}: {
  node: Node
  humanOverride?: import('@repo/db/fieldLineageHuman').HumanOperation
  definition: LineageDefinition
  reference: string
  references: Map<string, string>
  scopeLabels: Record<string, string>
  binding: ReleaseBinding | null
} = $props()
let open = $state(false)
let human = $derived(humanOverride ?? humanOperation(node, definition))
let selectedScope = $derived(
  node.when.kind === 'compare' &&
    node.when.input === 'selectedSource' &&
    typeof node.when.value === 'string'
    ? node.when.value
    : node.output.scope,
)
let pin = $derived(binding?.scopes.find(scope => scope.scopeId === selectedScope))
</script>
<article
  id={`provenance-node-${node.id}`}
  class="min-w-0 rounded-lg border border-foreground/15 [overflow-wrap:anywhere]"
>
  <Collapsible.Root bind:open>
    <Collapsible.Trigger
      class="flex w-full items-center gap-3 rounded-lg px-4 py-4 text-left hover:bg-foreground/5"
      aria-label={`${open ? 'Hide' : 'Show'} details: ${human?.title ?? visibleNodeTitle(node, definition)}`}
    >
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span
          class="flex flex-wrap items-center gap-x-2 text-xs leading-4 text-foreground/60"
        >
          {#if nodeStageLabel(node, definition) !== human?.title}
            <span>{nodeStageLabel(node, definition)}</span>
          {/if}
          {#if node.stage !== 'composition'}
            {#if nodeStageLabel(node, definition) !== human?.title}
              <span aria-hidden="true">·</span>
            {/if}
            <span>{scopeLabels[selectedScope]?.split(' · ')[0] ?? selectedScope}</span>
          {/if}
        </span>
        <span class="block text-sm font-semibold leading-5"
          >{human?.title ?? visibleNodeTitle(node, definition)}</span
        >
        {#if node.stage === 'composition' ||
          definition.scopes.some(
            scope => scope.id === node.output.scope && scope.kind === 'snapshot',
          )}
          <code class="text-xs text-foreground/60"
            >{node.output.collection}.{node.output.path}</code
          >
        {/if}
      </span>
      <span aria-hidden="true" class="text-lg text-foreground/50"
        >{open ? '−' : '+'}</span
      >
    </Collapsible.Trigger>
    <div class="px-4 py-3 text-xs text-foreground/65">
      {#if node.when.kind !== 'always' &&
        !(node.when.kind === 'compare' && node.when.input === 'selectedSource')}
        <p class="mb-2 leading-6">
          Applies when
          <Condition {definition} condition={node.when} labels={scopeLabels} />
        </p>
      {/if}
      {#if human?.rule}
        <Rule rule={human.rule} />
      {:else if human?.decisions?.length}
        <section
          class="space-y-2 border-l-2 border-secondary/40 pl-3"
          aria-label="Value choices"
        >
          {#each human.decisions as decision}
            <div>
              <p class="font-semibold">{decision.when}</p>
              <p class="mt-1 leading-relaxed">{decision.result}</p>
            </div>
          {/each}
        </section>
      {/if}
    </div>
    <Collapsible.Content class="px-4 pb-4">
      <ProvenanceDetails
        {node}
        humanOverride={human}
        {definition}
        {references}
        {scopeLabels}
        {pin}
      />
    </Collapsible.Content>
  </Collapsible.Root>
</article>
