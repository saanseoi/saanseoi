<script lang="ts">
import { m } from '@repo/i18n/messages'
import type { AlsDecision } from './auditAlsDecisions'
import type { AlsSearchRow } from './auditFixtureCatalogue'
import { getAuditAlsDecisions } from '#lib/registry/audit.remote.js'
import Instance from './auditAlsInstance.svelte'
import Copy from './auditCopyRule.svelte'
let {
  all,
  visible,
  query,
  releaseId,
  releaseCode,
  hash,
}: {
  all: AlsSearchRow[]
  visible: AlsSearchRow[]
  query: string
  releaseId: string
  releaseCode: string
  hash: string
} = $props()
let open = $state(false)
let decisions = $state<AlsDecision[]>([])
let loading = $state(false)
let failure = $state(false)
let generation = 0
const read = (offset = 0, copy = false) =>
  getAuditAlsDecisions({
    releaseId,
    releaseCode,
    hash,
    kind: all[0]!.kind,
    q: query,
    offset,
    all: copy,
  })
async function load(reset = false) {
  const request = ++generation
  loading = true
  failure = false
  if (reset) decisions = []
  try {
    const page = await read(decisions.length)
    if (request === generation) decisions = [...decisions, ...page]
  } catch {
    if (request === generation) failure = true
  } finally {
    if (request === generation) loading = false
  }
}
$effect(() => {
  query
  releaseId
  releaseCode
  hash
  if (open) void load(true)
  return () => {
    generation++
  }
})
</script>

<article class="overflow-hidden rounded-xl border border-current/15 text-sm">
  <details bind:open>
    <summary class="cursor-pointer px-4 py-4">
      <span class="font-medium">{all[0]?.title}</span>
      <span class="ml-2 text-xs tabular-nums opacity-55"
        >{query ? `${visible.length} / ` : ''}{all.length.toLocaleString()}
        {all.length === 1 ? m.source_audit_decision() : m.source_audit_decisions()}</span
      >
    </summary>
    {#if open}
      <div class="border-t border-current/10">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <p class="leading-relaxed opacity-65">{all[0]?.description}</p>
          <Copy
            kind="fixture"
            getRule={async () => (await read(0, true)).map(d => d.raw)}
          />
        </div>
        <div class="space-y-3 px-3 pb-3">
          {#each decisions as decision (decision.id)}
            <Instance {decision} />
          {/each}
          {#if failure}
            <p role="alert">{m.source_audit_load_actions_error()}</p>
          {/if}
          {#if loading}
            <p role="status">{m.source_audit_loading_rule_mappings()}</p>
          {:else if decisions.length < visible.length}
            <button
              type="button"
              class="w-full rounded-lg border border-current/15 px-4 py-3 hover:bg-current/5"
              onclick={() => load()}
            >
              {m.source_audit_show_more({ shown: decisions.length, total: visible.length })}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </details>
</article>
