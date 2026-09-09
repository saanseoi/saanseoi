<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { auditStatus } from './auditStatus'
import { getLocale } from '@repo/i18n/runtime'
import { translationParentName } from './translationParentName'
import type { IndividualAudit } from '@repo/core/provenance'
import Badge from '@iconify-svelte/proicons/badge'
let { row }: { row: IndividualAudit } = $props()
const text = (value: unknown) => (typeof value === 'string' ? value : '')
let source = $derived(text(row.context.sourceText))
let target = $derived(text(row.context.name ?? row.context.text))
let sourceLocale = $derived(text(row.context.sourceLocale))
let targetLocale = $derived(text(row.context.locale ?? row.context.targetLocale))
let title = $derived(source || row.record.names[0] || m.source_audit_record())
let parent = $derived(row.record.parents.at(-1))
let parentName = $derived(
  translationParentName(row.context, getLocale()) ?? parent?.names[0] ?? parent?.id,
)
let copied = $state(false)
let copyFailure = $state(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(row.record.id)
    copied = true
    copyFailure = false
  } catch {
    copyFailure = true
  }
}
</script>

<article
  class="overflow-hidden rounded-xl border border-current/10 bg-current/1.5 text-sm"
>
  <header class="flex items-center justify-between gap-4 px-4 py-3">
    <div class="min-w-0">
      <h4 class="truncate text-base font-medium" {title}>{title}</h4>
      {#if parent}
        <p class="mt-1 truncate text-xs opacity-50" title={parent.names.join(' · ')}>
          {m.source_audit_parent_value({ parent: parentName || parent.id })}
        </p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <span
        class="rounded-full bg-current/5 px-2 py-1 text-xs capitalize"
        class:text-emerald-500={row.outcome === 'applied' || row.outcome === 'no-change'}
        class:text-amber-500={row.outcome === 'skipped' || row.outcome === 'unmatched'}
        class:text-red-500={row.outcome === 'guard-mismatch'}
        >{auditStatus(row.outcome)}</span
      >
      <button
        type="button"
        class="rounded-md p-1.5 opacity-50 hover:bg-current/10 hover:opacity-100"
        aria-label={copied ? m.source_audit_application_id_copied() : m.source_audit_copy_application_id()}
        title={copied ? m.source_audit_copied() : m.source_audit_copy_record_id()}
        onclick={copy}
      >
        <Badge class="size-4" />
      </button>
    </div>
  </header>
  {#if source && target}
    <div class="grid grid-cols-2 gap-4 border-t border-current/10 px-4 py-3">
      <div class="min-w-0">
        <p class="mb-2 text-xs opacity-45">
          {m.source_audit_original()}
          <span
            class="ml-1 inline-block whitespace-nowrap rounded bg-current/5 px-1.5 py-0.5"
            >{sourceLocale}</span
          >
        </p>
        <p class="wrap-break-word">{source}</p>
      </div>
      <div class="min-w-0">
        <p class="mb-2 text-xs opacity-45">
          {m.source_audit_translation_result()}
          <span
            class="ml-1 inline-block whitespace-nowrap rounded bg-current/5 px-1.5 py-0.5"
            >{targetLocale}</span
          >
        </p>
        <p class="wrap-break-word font-medium">{target}</p>
      </div>
    </div>
  {/if}
  {#if row.outcome !== 'applied' || !source || !target}
    <p class="px-4 pb-3 leading-relaxed opacity-65">{row.reason}</p>
  {/if}
  <details class="border-t border-current/10 px-4 py-3">
    <summary class="cursor-pointer text-xs opacity-50">
      {m.source_audit_application_evidence()}
    </summary>
    <div class="mt-4 space-y-4">
      {#if row.outcome === 'applied' && source && target}
        <p class="leading-relaxed opacity-70">{row.reason}</p>
      {/if}
      <div>
        <p class="mb-1 text-xs uppercase tracking-wide opacity-40">
          {m.source_audit_record_id()}
        </p>
        <p class="break-all font-mono text-xs opacity-65">{row.record.id}</p>
      </div>
      {#if row.record.parents.length}
        <div>
          <p class="mb-1 text-xs uppercase tracking-wide opacity-40">
            {m.source_audit_parent_hierarchy()}
          </p>
          <ol class="space-y-1 text-xs opacity-65">
            {#each row.record.parents as ancestor}
              <li>{ancestor.names.join(' · ') || ancestor.id}</li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>
  </details>
  {#if copyFailure}
    <p class="px-4 pb-3 text-xs" role="alert">{m.source_audit_copy_record_error()}</p>
  {/if}
</article>
