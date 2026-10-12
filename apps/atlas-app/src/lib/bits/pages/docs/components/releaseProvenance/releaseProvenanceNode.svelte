<script lang="ts">
import type { LineageDefinition, Node } from '@repo/db/fieldLineageTypes'
import { conditionLabel, operationLabel } from './presentation'
let {
  node,
  definition,
  index,
  steps,
  scopeLabels,
}: {
  node: Node
  definition: LineageDefinition
  index: number
  steps: Map<string, number>
  scopeLabels: Record<string, string>
} = $props()
const stageNames = {
  preparation: 'Preparation',
  ingestion: 'Ingestion',
  assembly: 'Assembly',
  composition: 'Composition → API response',
}
function inputLabel(input: Node['inputs'][string]) {
  if ('node' in input) {
    const source = definition.nodes.find(node => node.id === input.node)
    return source
      ? `Step ${steps.get(source.id) ?? '?'} · ${source.output.collection} · ${source.output.path}`
      : 'Unavailable dependency'
  }
  if ('group' in input) {
    const group = definition.resolutionGroups.find(group => group.id === input.group)
    return group
      ? `${group.output.collection} · ${group.output.path} (select from steps ${group.candidates
          .map(id => steps.get(id))
          .filter(Boolean)
          .join(', ')})`
      : 'Unavailable selection'
  }
  const scope = definition.scopes.find(scope => scope.id === input.scope)
  return `${scopeLabels[input.scope] ?? scope?.datasetCode ?? input.stage} · ${input.collection} · ${input.path}`
}
</script>
<li class="relative border-l-2 border-primary/25 pb-6 pl-6 last:pb-0">
  <span
    class="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-background"
    >{index + 1}</span
  >
  <article class="rounded-xl border border-foreground/15 bg-background p-4">
    <div class="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
      <span class="font-semibold text-primary">{stageNames[node.stage]}</span>
      <span>{node.layer.replaceAll('-', ' ')} · priority {node.priority}</span>
    </div>
    <h4 class="mt-2 font-semibold">{operationLabel(node)}</h4>
    <p class="mt-1 break-words text-sm">
      Produces <code>{node.output.collection}.{node.output.path}</code>
    </p>
    <dl class="mt-3 space-y-2 text-sm">
      {#each Object.entries(node.inputs) as [name, input]}
        <div class="grid gap-1 sm:grid-cols-[9rem_1fr]">
          <dt class="text-foreground/60">{name} · {input.role}</dt>
          <dd class="break-words">{inputLabel(input)}</dd>
        </div>
      {/each}
      <div class="grid gap-1 sm:grid-cols-[9rem_1fr]">
        <dt class="text-foreground/60">Applies when</dt>
        <dd>{conditionLabel(node.when, scopeLabels)}</dd>
      </div>
      {#if node.selection}
        <div class="grid gap-1 sm:grid-cols-[9rem_1fr]">
          <dt class="text-foreground/60">Selection</dt>
          <dd>
            {node.selection.cardinality};
            {node.selection.onMultiple.replaceAll('-', ' ')}
            when several match
          </dd>
        </div>
      {/if}
      <div class="grid gap-1 sm:grid-cols-[9rem_1fr]">
        <dt class="text-foreground/60">Missing input</dt>
        <dd>{node.onAbsent.replaceAll('-', ' ')}</dd>
      </div>
    </dl>
  </article>
</li>
