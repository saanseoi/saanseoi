<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Copy from './auditCopyRule.svelte'
import { alsHandlingFields, type AlsDecision } from './auditAlsDecisions'
let { decision }: { decision: AlsDecision } = $props()
</script>

<article class="overflow-hidden rounded-lg border border-current/15">
  <header class="flex items-center justify-between gap-3 bg-current/2.5 px-4 py-3">
    <p class="text-sm font-medium">
      {decision.context.join(' · ') || 'Reviewed address'}
    </p>
    <Copy kind="fixture" getRule={async () => decision.raw} />
  </header>
  <div class="grid grid-cols-1 border-t border-current/10 sm:grid-cols-2">
    {#each [{ title: m.source_audit_input(), value: decision.input }, { title: m.source_audit_output(), value: decision.output }] as side}
      <section
        class="min-w-0 space-y-3 px-4 py-3 first:border-b first:border-current/10 sm:first:border-b-0 sm:first:border-r"
      >
        <h5 class="text-xs uppercase opacity-45">{side.title}</h5>
        <dl class="space-y-2 text-sm">
          {#each alsHandlingFields(side.value) as field}
            <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt class="break-words opacity-60">{field.label}</dt>
              <dd class="max-w-full break-words text-emerald-500">{field.value}</dd>
            </div>
          {:else}
            <p class="opacity-55">No structured values retained for this side.</p>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
  <footer
    class="flex flex-wrap gap-x-5 gap-y-2 border-t border-current/10 px-4 py-3 text-xs opacity-60"
  >
    <span>Mode: {decision.mode.replaceAll('-', ' ')}</span>
    <span>Since: {decision.since}</span>
    <span>Last verified: {decision.lastVerified}</span>
  </footer>
</article>
