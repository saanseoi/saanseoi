<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { matchesAudit } from './auditSearch'
import RuleText from './auditRuleText.svelte'
import CopyRule from './auditCopyRule.svelte'
import ScrollArea from './auditScrollArea.svelte'
import type { Json } from '@repo/core/provenance'
let {
  title,
  explanation,
  rows,
  query = '',
  getRule,
  onmatch,
}: {
  title: string
  explanation: string
  rows: Array<{
    id?: string
    locale?: string
    precedence?: number
    displayPriority?: number
    condition: string
    result: string
    matched?: number
    changed?: number
  }>
  query?: string
  getRule: () => Promise<Json>
  onmatch?: (title: string, matching: boolean) => void
} = $props()
let matchingRows = $derived(
  matchesAudit(query, m.source_audit_rules(), title, explanation)
    ? rows
    : rows.filter(row => matchesAudit(query, row)),
)
let matching = $derived(
  matchesAudit(query, m.source_audit_rules(), title, explanation) ||
    matchingRows.length > 0,
)
$effect(() => {
  onmatch?.(title, matching)
})
</script>
{#if matching}
  <article class="overflow-hidden rounded-xl border border-current/15 text-sm">
    <header
      class="flex min-h-14 items-center justify-between gap-4 bg-current/2.5 px-4 py-3"
    >
      <h4 class="text-base font-medium">{title}</h4>
      <CopyRule {getRule} />
    </header>
    <p class="border-t border-current/10 px-4 py-3 leading-relaxed opacity-65">
      {explanation}
    </p>
    {#if rows.length}
      <details class="border-t border-current/10 px-4 py-3" open={!!query}>
        <summary class="cursor-pointer text-sm opacity-70">
          {m.source_audit_mappings_conditions()}
          · {matchingRows.length}
        </summary>
        <ScrollArea containerClass="mt-3" viewportClass="max-h-[640px] overflow-auto">
          {#snippet children()}
            <table class="w-full text-left text-sm">
              <thead
                class="sticky top-0 z-10 bg-background text-xs uppercase tracking-wide [&_th]:text-foreground/50"
              >
                <tr>
                  <th class="pb-2 pr-4 font-medium">
                    {m.source_audit_branch_priority()}
                  </th>
                  <th class="pb-2 pr-4 font-medium">{m.source_audit_when()}</th>
                  <th class="pb-2 font-medium">{m.source_audit_map_to()}</th>
                  <th class="pb-2 pl-4 font-medium">
                    {m.source_audit_outcome_matched()}
                  </th>
                  <th class="pb-2 pl-4 font-medium">{m.source_audit_changed()}</th>
                </tr>
              </thead>
              <tbody>
                {#each matchingRows as row, index}
                  {#if row.locale && row.locale !== matchingRows[index - 1]?.locale}
                    <tr class="border-t border-current/15 bg-current/5">
                      <th colspan="5" class="px-2 py-2 text-sm font-medium">
                        {row.locale === 'en'
                        ? m.source_locale_en()
                        : row.locale === 'zh-hant'
                          ? m.source_locale_zh_hant()
                          : row.locale === 'zh-hans'
                            ? m.source_locale_zh_hans()
                            : row.locale}
                      </th>
                    </tr>
                  {/if}
                  <tr class="border-t border-current/10">
                    <td class="py-2 pr-4 text-xs">
                      <span class="inline-flex items-center gap-2">
                        <span
                          class="inline-flex min-w-5 shrink-0 items-center justify-center rounded bg-black px-1.5 py-0.5 text-xs text-white tabular-nums"
                        >
                          {row.displayPriority ?? row.precedence ?? m.source_audit_not_recorded()}
                        </span>
                        <span>{row.id ?? m.source_audit_not_recorded()}</span>
                      </span>
                    </td>
                    <td class="py-2 pr-4 leading-7">
                      <RuleText text={row.condition} />
                    </td>
                    <td class="py-2 leading-7"><RuleText text={row.result} /></td>
                    <td class="py-2 pl-4 tabular-nums">
                      {row.matched?.toLocaleString() ?? m.source_audit_not_recorded()}
                    </td>
                    <td class="py-2 pl-4 tabular-nums">
                      {row.changed?.toLocaleString() ?? m.source_audit_not_recorded()}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/snippet}
        </ScrollArea>
      </details>
    {/if}
  </article>
{/if}
