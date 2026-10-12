<script lang="ts">
import type { FieldPlan } from '@repo/db/fieldLineageTypes'
let {field, onSelectField}: {field: FieldPlan; onSelectField: (terminalNode: string) => void} = $props()
let name = $derived(field.apiField.replace(/^attributes\./, ''))
</script>
<aside class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm" aria-label="Field dependency">
  <span>Uses <strong>{field.resourceType}.{name}</strong>{field.variant ? ` · ${field.variant}` : ''}</span>
  <button type="button" class="text-xs font-semibold text-primary underline underline-offset-4" onclick={() => onSelectField(field.terminalNode)}>View {name} lineage →</button>
</aside>
