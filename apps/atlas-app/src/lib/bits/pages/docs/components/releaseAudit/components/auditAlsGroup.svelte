<script lang="ts">
import { m } from '@repo/i18n/messages'
import type { AlsDecision } from './auditAlsDecisions'
import Instance from './auditAlsInstance.svelte'
import Copy from './auditCopyRule.svelte'
let {
  all,
  visible,
  query,
}: { all: AlsDecision[]; visible: AlsDecision[]; query: string } = $props()
let open = $state(false)
let limit = $state(10)
$effect(() => {
  query
  limit = 10
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
          <Copy kind="fixture" getRule={async () => visible.map(d => d.raw)} />
        </div>
        <div class="space-y-3 px-3 pb-3">
          {#each visible.slice(0, limit) as decision (decision.id)}
            <Instance {decision} />
          {/each}
          {#if limit < visible.length}
            <button
              type="button"
              class="w-full rounded-lg border border-current/15 px-4 py-3 hover:bg-current/5"
              onclick={() => limit += 10}
            >
              {m.source_audit_show_more({ shown: Math.min(limit, visible.length), total: visible.length })}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </details>
</article>
