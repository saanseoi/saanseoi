<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Copy from '@iconify-svelte/proicons/copy'
import type { Json } from '@repo/core/provenance'
let { getRule, kind = 'rule' }: { getRule: () => Promise<Json>; kind?: string } =
  $props()
let pending = $state(false)
let status = $state('')
async function copy() {
  if (pending) return
  pending = true
  status = ''
  try {
    const rule = getRule().then(value => JSON.stringify(value, null, 2))
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': rule.then(text => new Blob([text], { type: 'text/plain' })),
        }),
      ])
    } else await navigator.clipboard.writeText(await rule)
    status =
      kind === 'rule' ? m.source_audit_rule_copied() : m.source_audit_fixture_copied()
  } catch {
    status =
      kind === 'rule'
        ? m.source_audit_copy_rule_error()
        : m.source_audit_copy_fixture_error()
  } finally {
    pending = false
  }
}
</script>
<div class="flex shrink-0 items-center gap-2">
  {#if status}
    <span role="status" class="text-xs opacity-65">{status}</span>
  {/if}
  <button
    type="button"
    aria-label={kind === 'rule' ? m.source_audit_copy_rule() : m.source_audit_copy_fixture()}
    title={kind === 'rule' ? m.source_audit_copy_full_rule() : m.source_audit_copy_full_fixture()}
    disabled={pending}
    onclick={copy}
    class="rounded-md p-1.5 opacity-50 hover:bg-current/10 hover:opacity-100 disabled:cursor-wait motion-safe:disabled:animate-pulse"
  >
    <Copy class="size-4" />
  </button>
</div>
