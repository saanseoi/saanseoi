<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject, auditLabel, nameActionLabels } from './auditDivisionPresentation'
import Value from './auditDivisionValue.svelte'
let { definition }: { definition: Record<string, Json> } = $props()
const languages: Record<string, string> = {
  en: 'English',
  'zh-hant': 'Traditional Chinese',
  'zh-hans': 'Simplified Chinese',
  yue: 'Cantonese',
  'yue-latn': 'Cantonese (Latin)',
  vi: 'Vietnamese',
}
let patches = $derived(Object.entries(auditObject(definition.names)))
let sharedRemovals = $derived(
  patches.length > 1 &&
    patches.every(([, patch]) => {
      const row = auditObject(patch)
      return (
        Object.keys(row).length === 1 &&
        Array.isArray(row.removeAliases) &&
        JSON.stringify(row.removeAliases) ===
          JSON.stringify(auditObject(patches[0]?.[1]).removeAliases)
      )
    })
    ? auditObject(patches[0]?.[1]).removeAliases
    : null,
)
</script>
<div class="space-y-4">
  {#if definition.divisionId}
    <p class="break-all text-sm">
      <span class="mr-2 opacity-50">Division ID</span>{String(definition.divisionId)}
    </p>
  {/if}
  {#if sharedRemovals}
    <section class="space-y-3 rounded-lg border border-current/15 bg-current/2.5 p-4">
      <h5 class="font-medium">Remove aliases</h5>
      <p class="text-sm opacity-60">
        Remove these incorrect aliases from
        {patches.map(([locale]) => languages[locale] ?? locale).join(' and ')}.
      </p>
      <Value value={sharedRemovals} />
    </section>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each Object.entries(auditObject(definition.names)) as [locale, patch]}
        <section
          class="space-y-3 rounded-lg border border-current/15 bg-current/2.5 p-4"
        >
          <h5 class="flex items-center justify-between gap-3 font-medium">
            {languages[locale] ?? locale}<span class="font-mono text-xs opacity-50"
              >{locale}</span
            >
          </h5>
          {#each Object.entries(auditObject(patch)) as [action, value]}
            <div class="space-y-2 border-t border-current/10 pt-3">
              <p class="text-xs font-medium uppercase tracking-wide opacity-60">
                {nameActionLabels[action] ?? auditLabel(action)}
              </p>
              {#if action !== 'remove'}
                <Value {value} />
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</div>
