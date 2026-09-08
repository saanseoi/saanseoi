<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
import { rowKeys } from './retainedAuditFixtureRows'
import FieldMappings from './retainedAuditFieldMappings.svelte'
import IdentityMappings from './retainedAuditIdentityMappings.svelte'
import Measures from './retainedAuditMeasures.svelte'
import Translations from './retainedAuditTranslations.svelte'
let { value }: { value: Json } = $props()
const label = (key: string) =>
  key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/[_-]/g, ' ')
</script>

{#snippet render(item: Json)}
  {#if Array.isArray(item)}
    <ul class="space-y-3">
      {#each item as entry}
        <li class="border-l border-current/15 pl-3">{@render render(entry)}</li>
      {/each}
    </ul>
  {:else if item !== null && typeof item === 'object'}
    <dl class="grid grid-cols-[minmax(7rem,1fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-sm">
      {#each Object.entries(item) as [key, child]}
        <dt class="font-medium capitalize opacity-65">{label(key)}</dt>
        <dd class="min-w-0 break-words">{@render render(child)}</dd>
      {/each}
      {#if 'isTranslationVerified' in item && 'locale' in item && !('origin' in item)}
        <dt class="font-medium opacity-65">{m.source_audit_origin()}</dt>
        <dd>{m.source_audit_origin_unrecorded()}</dd>
      {/if}
    </dl>
  {:else}
    <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
      >{item === null ? '—' : String(item)}</code
    >
  {/if}
{/snippet}

{#if value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.fields)}
  <FieldMappings fields={value.fields} />
{/if}
{#if value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.mappings)}
  <IdentityMappings mappings={value.mappings} />
{/if}
{#if value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.measures)}
  <Measures measures={value.measures} />
{/if}
{#if value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.entries) && value.entries.some(e => e && typeof e === 'object' && !Array.isArray(e) && ('targetLocale' in e || 'sourceLocale' in e))}
  <Translations entries={value.entries} />
{:else if value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.entries)}
  {@render render(value.entries)}
{/if}
{#if !value || typeof value !== 'object' || Array.isArray(value) || !rowKeys.some(key => Array.isArray(value[key]))}
  {@render render(value)}
{/if}
