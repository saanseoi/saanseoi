<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import type { AuditBulkRule } from './releaseAuditBulkSections'
import { formatAuditOperationCode } from './releaseAuditUtils'

import ReleaseAuditBulkSection from './releaseAuditBulkSection.svelte'

type Props = {
  locale: string
  rules: AuditBulkRule[]
}

let { locale, rules }: Props = $props()

const descriptionForLocale = (rule: AuditBulkRule) =>
  rule.i18n.find(item => item.locale.toLowerCase() === locale.toLowerCase())
    ?.description ??
  rule.i18n.find(item => item.locale === 'en')?.description ??
  rule.i18n[0]?.description
</script>

{#if rules.length}
  <section class="mt-6 grid gap-6" aria-label={m.source_bulk_actions()}>
    {#each rules as rule (rule.id ?? rule.operationCode)}
      {@const description = descriptionForLocale(rule)}
      <ReleaseAuditBulkSection
        {description}
        {rule}
        title={formatAuditOperationCode(rule.operationCode)}
      />
    {/each}
  </section>
{/if}
