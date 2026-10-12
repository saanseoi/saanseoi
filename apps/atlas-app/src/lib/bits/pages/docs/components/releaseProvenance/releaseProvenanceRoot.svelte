<script lang="ts">
import { getReleaseProvenance } from '#lib/registry/provenance.remote.js'
import { conditionLabel, traceNodes } from './presentation'
import ProvenanceNode from './releaseProvenanceNode.svelte'
let { releaseSetId }: { releaseSetId: string } = $props()
let search = $state('')
let selectedKey = $state('')
let request = $derived(getReleaseProvenance(releaseSetId))
let definition = $derived(request.current?.definition)
let fields = $derived(
  (definition?.fields ?? []).filter(field =>
    `${field.resourceType} ${field.apiField} ${field.variant ?? ''} ${field.operationId ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  ),
)
const key = (field: { resourceType: string; apiField: string; terminalNode: string }) =>
  `${field.resourceType}:${field.apiField}:${field.terminalNode}`
let selected = $derived(fields.find(field => key(field) === selectedKey) ?? fields[0])
let nodes = $derived(
  definition && selected ? traceNodes(definition, selected.terminalNode) : [],
)
</script>
<section class="space-y-5" aria-label="Field provenance">
  <header>
    <h2 class="text-xl font-semibold">Field lineage</h2>
    <p class="mt-2 max-w-3xl text-sm text-foreground/65">
      Follow an API field from its source through preparation, ingestion, assembly and
      composition to the API response. Conditional steps describe possible paths;
      individual records may take different paths.
    </p>
  </header>
  {#if request.error}
    <p role="alert">Field lineage could not be loaded.</p>
    <button
      type="button"
      class="rounded-lg border px-3 py-2"
      onclick={() => request.refresh()}
    >
      Try again
    </button>
  {:else if !request.ready}
    <p role="status" class="animate-pulse py-10 text-foreground/60">
      Loading field lineage…
    </p>
  {:else if !definition}
    <p class="rounded-xl border border-foreground/15 p-6 text-foreground/65">
      No field lineage is retained for this release set.
    </p>
  {:else}
    <div class="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside class="space-y-3">
        <label class="block text-sm font-semibold" for="provenance-search"
          >Find a field</label
        >
        <input
          id="provenance-search"
          type="search"
          bind:value={search}
          placeholder="Search fields or resources"
          class="w-full rounded-lg border border-foreground/20 bg-background px-3 py-2"
        >
        <p class="text-xs text-foreground/60">{fields.length} fields</p>
        <nav aria-label="API fields" class="max-h-[65vh] space-y-1 overflow-y-auto">
          {#each fields as field, index (`${key(field)}:${index}`)}
            <button
              type="button"
              aria-pressed={selected === field}
              onclick={() => (selectedKey = key(field))}
              class={`w-full rounded-lg border p-3 text-left text-sm ${selected === field ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-foreground/5'}`}
            >
              <span class="block break-all font-semibold">{field.apiField}</span
              ><span class="mt-1 block text-xs text-foreground/60"
                >{field.resourceType}{field.variant
                  ? ` · ${field.variant}`
                  : ''}{field.operationId ? ` · ${field.operationId}` : ''}</span
              >
            </button>
          {:else}
            <p class="py-4 text-sm text-foreground/60">No fields match your search.</p>
          {/each}
        </nav>
      </aside>
      <div class="min-w-0">
        {#if selected}
          <header class="mb-5 rounded-xl bg-foreground/5 p-4">
            <h3 class="break-all text-lg font-semibold">{selected.apiField}</h3>
            <p class="mt-2 text-sm">Emitted: {conditionLabel(selected.emitWhen)}</p>
            <p class="mt-1 text-sm text-foreground/60">
              {selected.completeness === 'complete'
                ? 'Complete retained trace'
                : 'Upstream lineage is incomplete'}
              · {nodes.length} steps
            </p>
            <p class="mt-2 text-xs text-foreground/60">
              Later layers override earlier ones: baseline → conditional rule → curation
              → patch. Within each layer, the first applicable candidate wins in
              ascending priority.
            </p>
          </header>
          <ol class="ml-3">
            {#each nodes as node, index (node.id)}
              <ProvenanceNode
                {node}
                {definition}
                {index}
                scopeLabels={request.current?.scopeLabels ?? {}}
                steps={new Map(nodes.map((node, index) => [node.id, index + 1]))}
              />
            {/each}
          </ol>
        {/if}
      </div>
    </div>
  {/if}
</section>
