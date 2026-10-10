<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject } from './auditDivisionPresentation'
import { matchesAudit } from './auditSearch'
import RuleMappings from './auditRuleMappings.svelte'
import Records from './auditDivisionRecords.svelte'
let {
  value,
  decisions,
  query = '',
  only,
}: {
  value: Json
  decisions?: Record<string, number>
  query?: string
  only?: 'excluded' | 'restored'
} = $props()
let outcomes = $derived(decisions ?? auditObject(auditObject(value).outcomes))
let records = $derived(auditObject(auditObject(value).outcomeRecords))
let patterns = $derived(
  auditObject(auditObject(value).updatePolicy).excludedNewNamePatterns,
)
const languages: Record<string, string> = {
  en: 'English',
  'zh-hant': 'Traditional Chinese',
  'zh-hans': 'Simplified Chinese',
}
let rules = $derived([
  {
    key: 'excluded',
    title: 'Exclusions',
    condition:
      Array.isArray(patterns) && patterns.length
        ? `New division; name matches ${patterns.map(pattern => `“${String(pattern).replaceAll('\\b', '')}”`).join(' or ')}`
        : 'New division; name matches an exclusion pattern (patterns not retained)',
    result: 'Exclude the division',
    explanation: 'Leave out new source records whose names match the coverage filter.',
  },
  {
    key: 'restored',
    title: 'Missing names',
    condition: 'Existing name missing from the new source data',
    result: 'Retain that name',
    explanation:
      'Keep names from the reference source records and curated additions when the new source data omits them.',
  },
])
</script>
<div class="space-y-4">
  {#each rules.filter(rule => !only || rule.key === only) as rule}
    {@const count = Number(outcomes[rule.key] ?? 0)}
    {@const entries = (
      Array.isArray(records[rule.key]) ? (records[rule.key] as Json[]) : []
    ).filter(entry => !query || matchesAudit(query, entry, rule))}
    {#if !query || entries.length || matchesAudit(query, rule)}
      <section class="space-y-2" aria-label={rule.title}>
        <RuleMappings
          title={rule.title}
          explanation={rule.explanation}
          rows={[
            {
              id: rule.key,
              precedence: 1,
              condition: rule.condition,
              result: rule.result,
              matched: count,
              changed: count,
            },
          ]}
          getRule={async () => ({ ...rule, patterns: patterns ?? null })}
        >
          {#snippet footer()}
            <details class="border-t border-current/15" open={Boolean(query.trim())}>
              <summary class="cursor-pointer px-4 py-5 text-base font-medium">
                Results
                <span class="ml-2 text-sm tabular-nums opacity-60">{count}</span>
              </summary>

              {#if entries.length}
                <Records
                  type="curation-definitions"
                  showDescription={false}
                  framed={false}
                  value={{
                    entries: entries.map((entry): Json => {
                      const row = auditObject(entry)
                      const locale =
                        String(row.field).match(/^names\.(.+)\.name$/)?.[1] ?? ''
                      return {
                        section: rule.key,
                        definition:
                          rule.key === 'restored'
                            ? {
                                divisionId: row.divisionId ?? null,
                                names: { [locale]: row.before ?? null },
                                reason: `Retained ${languages[locale] ?? locale} name`,
                              }
                            : {
                                ...auditObject(row.proposed ?? row.before),
                                divisionId: row.divisionId ?? null,
                              },
                      }
                    }),
                  }}
                />
              {:else if count && !query}
                <p class="px-4 text-sm opacity-60">
                  Affected records were not saved in this audit.
                </p>
              {/if}
            </details>
          {/snippet}
        </RuleMappings>
      </section>
    {/if}
  {/each}
</div>
