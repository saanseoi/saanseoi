<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { auditStatus } from './auditStatus'
import Badge from '@iconify-svelte/proicons/badge'
import type { Json } from '@repo/core/provenance'
import PatchValue from './auditPatchValue.svelte'
let {
  title,
  reason,
  input,
  output,
  id,
  status = 'applied',
  statusLabel,
}: {
  title: string
  reason: string
  input: Json
  output: Json
  id?: string
  status?: string
  statusLabel?: string
} = $props()
let copied = $state(false)
let copyFailure = $state(false)
async function copyId() {
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    copied = true
    copyFailure = false
  } catch {
    copyFailure = true
  }
}
const label = (value: string) =>
  value.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/[_-]/g, ' ')
const fieldOrder = [
  'id',
  'type',
  'types',
  'subtype',
  'names',
  'hierarchies',
  'country',
  'wikidata',
]
const hiddenFields = [
  'identifiers',
  'parentDivisionId',
  'parent_division_id',
  'sources',
  'geometry',
]
const fields = (value: Record<string, Json>) =>
  Object.entries(value)
    .filter(([key]) => !hiddenFields.includes(key))
    .sort(
      ([a], [b]) =>
        (fieldOrder.includes(a) ? fieldOrder.indexOf(a) : fieldOrder.length) -
        (fieldOrder.includes(b) ? fieldOrder.indexOf(b) : fieldOrder.length),
    )
const display = (value: Json): string =>
  value === null
    ? m.source_audit_none_value()
    : Array.isArray(value)
      ? value.map(display).join(' · ')
      : typeof value === 'object'
        ? Object.entries(value)
            .map(([key, child]) => `${label(key)}: ${display(child)}`)
            .join(' · ')
        : String(value)
</script>

<article class="overflow-hidden rounded-xl border border-current/15 text-sm">
  <header
    class="flex min-h-14 items-center justify-between gap-4 bg-current/2.5 px-4 py-3"
  >
    <h4 class="text-base font-medium">{title}</h4>
    <div class="flex shrink-0 items-center gap-3">
      <span
        class="rounded-full bg-current/5 px-2 py-1 text-xs capitalize"
        class:text-emerald-500={/applied|assigned|no-change/i.test(status)}
        class:text-amber-500={/skipped|unmatched/i.test(status)}
        class:text-red-500={status === 'guard-mismatch'}
        >{statusLabel ?? auditStatus(status)}</span
      >
      {#if id}
        <button
          type="button"
          class="rounded-md p-1.5 opacity-60 hover:bg-current/10 hover:opacity-100"
          aria-label={copied ? m.source_audit_record_id_copied() : m.source_audit_copy_record_id()}
          title={copied ? m.source_audit_copied() : m.source_audit_copy_id_value({ id })}
          onclick={copyId}
        >
          <Badge class="size-4" />
        </button>
      {/if}
    </div>
  </header>
  <p class="border-t border-current/10 px-4 py-3 leading-relaxed opacity-65">
    {reason}
  </p>
  <div class="grid grid-cols-2 divide-x divide-current/10 border-t border-current/10">
    {#each [{ title: m.source_audit_input(), value: input }, { title: m.source_audit_output(), value: output }] as side}
      <div class="min-w-0 space-y-2 p-4">
        <p class="text-xs font-medium uppercase tracking-wide opacity-45">
          {side.title}
        </p>
        {#if side.value && typeof side.value === 'object' && !Array.isArray(side.value)}
          <dl class="space-y-2">
            {#each fields(side.value) as [key, value]}
              <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt class="capitalize opacity-55">{label(key)}</dt>
                <dd
                  class="min-w-0 wrap-break-word font-medium"
                  class:w-full={typeof value === 'object' && value !== null}
                  class:pl-6={typeof value === 'object' && value !== null}
                >
                  <PatchValue {value} hierarchy={key === 'hierarchies'} />
                </dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="wrap-break-word font-medium">{display(side.value)}</p>
        {/if}
      </div>
    {/each}
  </div>
  {#if copyFailure}
    <p class="px-4 pb-3 text-xs" role="alert">
      {m.source_audit_copy_id_error({ id: id ?? '' })}
    </p>
  {/if}
  <span class="sr-only" role="status"
    >{copied ? m.source_audit_record_id_clipboard() : ''}</span
  >
</article>
