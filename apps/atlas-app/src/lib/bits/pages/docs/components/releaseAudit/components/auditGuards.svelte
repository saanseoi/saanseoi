<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { auditStatus } from './auditStatus'
import type { AuditGuard } from '@repo/core/provenance'
import Shield from '@iconify-svelte/proicons/shield'
import Trophy from '@iconify-svelte/proicons/trophy'
import { guardCopy } from './auditGuardCopy'
import RuleText from './auditRuleText.svelte'
import SectionHeading from './auditSectionHeading.svelte'
let { guards }: { guards: AuditGuard[] } = $props()
</script>
<section class="space-y-3" aria-label={m.source_audit_guards()}>
  <SectionHeading
    title={m.source_audit_guards()}
    label={m.source_audit_guards_info()}
    description={m.source_audit_guards_info_description()}
  />
  {#each guards as guard (guard.id)}
    {@const copy = guardCopy(guard)}
    <article
      class="grid grid-cols-[minmax(0,1fr)_7rem] overflow-hidden rounded-xl border border-current/15 text-sm sm:grid-cols-[minmax(0,1fr)_9rem]"
    >
      <div class="min-w-0 divide-y divide-current/10">
        <div class="flex items-center gap-3 bg-current/2.5 px-4 py-4">
          <span
            role="img"
            aria-label={m.source_audit_requirement()}
            title={m.source_audit_requirement()}
            class="shrink-0 opacity-45"
            ><Shield class="size-5" /></span
          >
          <div class="min-w-0 space-y-2">
            <p class="font-medium">{copy.summary}</p>
            {#if copy.checks.length}
              <ul class="space-y-1 text-xs leading-6">
                {#each copy.checks as check}
                  <li><RuleText text={check} /></li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
        <div class="flex items-center gap-3 px-4 py-4">
          <span
            role="img"
            aria-label={m.source_audit_result()}
            title={m.source_audit_guard_result()}
            class="shrink-0 opacity-45"
            ><Trophy class="size-5" /></span
          >
          <p class="opacity-65">{copy.reason}</p>
        </div>
      </div>
      <div
        class={['flex flex-col items-center justify-center gap-2 border-l border-current/10 px-3 py-4 text-center', guard.status === 'passed' ? 'bg-emerald-500/10 text-emerald-500' : guard.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500']}
      >
        <p class="text-base font-semibold capitalize sm:text-lg">
          {auditStatus(guard.status)}
        </p>
        <p class="text-xs">
          {#if guard.id === 'overture-division-source-assumptions'}
            {guard.checked === 1 ? m.source_audit_file_check_count({ count: guard.checked.toLocaleString() }) : m.source_audit_file_checks_count({ count: guard.checked.toLocaleString() })}
          {:else}
            {m.source_audit_checked_count({ count: guard.checked.toLocaleString() })}
          {/if}
        </p>
        {#if guard.failed}
          <p class="text-xs">
            {m.source_audit_failed_count({ count: guard.failed.toLocaleString() })}
          </p>
        {/if}
      </div>
    </article>
  {/each}
</section>
