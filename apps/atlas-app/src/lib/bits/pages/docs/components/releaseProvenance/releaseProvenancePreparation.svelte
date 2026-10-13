<script lang="ts">
import { Collapsible } from 'bits-ui'
import type { Snippet } from 'svelte'
let { children }: { children: Snippet } = $props()
let open = $state(false)
</script>
<Collapsible.Root bind:open class="rounded-lg border border-foreground/15">
  <Collapsible.Trigger
    class="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-semibold"
  >
    Preprocess publisher artefact
    <span aria-hidden="true">{open ? '−' : '+'}</span>
  </Collapsible.Trigger>
  <p class="px-4 pb-3 text-xs text-foreground/65">
    Follow the applicable transformations and SaanSeoi curated choices for this field.
  </p>
  <Collapsible.Content class="space-y-3 px-3 pb-3"
    >{@render children()}</Collapsible.Content
  >
</Collapsible.Root>
