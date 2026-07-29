<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

import ReleaseAuditCardHeader from './releaseAuditCardHeader.svelte'

type Props = {
  condition?: string
  description?: string
  headingId: string
  sourceFieldPath?: string
  targetFieldPath?: string
  title: string
}

let {
  condition,
  description,
  headingId,
  sourceFieldPath,
  targetFieldPath,
  title,
}: Props = $props()

const formatFieldPath = (value: string) =>
  value
    .split(',')
    .map(path => path.trim())
    .filter(Boolean)
    .join(' / ')
</script>

<ReleaseAuditCardHeader>
  <div class={`grid gap-6 ${condition ? 'lg:grid-cols-2 lg:gap-8' : ''}`}>
    <div class="min-w-0">
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        {m.source_audit_bulk_action()}
      </p>
      <h2
        id={headingId}
        class="mt-1 min-w-0 font-display text-title-md font-bold text-primary"
      >
        {title}
      </h2>
      {#if description}
        <p class="mt-2 font-body text-label-md leading-6 text-primary">
          {description}
        </p>
      {/if}
    </div>

    {#if condition}
      <div class="border-l border-data-outline-variant/60 pl-6 lg:pl-8">
        {#if sourceFieldPath || targetFieldPath}
          <div class="mb-5 flex flex-wrap items-start gap-x-8 gap-y-3">
            {#if sourceFieldPath}
              <div class="min-w-0">
                <p
                  class="font-mono text-caption font-medium tracking-[0.06em] whitespace-nowrap text-foreground-alt/75"
                >
                  {m.source_audit_source_field()}
                </p>
                <p
                  class="mt-1 wrap-break-word font-mono text-label-md leading-5 font-semibold text-data-primary"
                >
                  {formatFieldPath(sourceFieldPath)}
                </p>
              </div>
            {/if}
            {#if targetFieldPath}
              <div class="min-w-0">
                <p
                  class="font-mono text-caption font-medium tracking-[0.06em] whitespace-nowrap text-foreground-alt/75"
                >
                  {m.source_audit_canonical_field()}
                </p>
                <p
                  class="mt-1 wrap-break-word font-mono text-label-md leading-5 font-semibold text-primary"
                >
                  {formatFieldPath(targetFieldPath)}
                </p>
              </div>
            {/if}
          </div>
        {/if}
        <p
          class="font-mono text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
        >
          {m.source_audit_condition()}
        </p>
        <p class="mt-2 font-body text-label-md leading-6 text-primary">
          {condition}
        </p>
      </div>
    {:else if sourceFieldPath || targetFieldPath}
      <div class="flex flex-wrap items-start gap-x-8 gap-y-3 lg:justify-self-end">
        {#if sourceFieldPath}
          <div class="min-w-0 lg:text-right">
            <p
              class="font-mono text-caption font-medium tracking-[0.06em] whitespace-nowrap text-foreground-alt/75"
            >
              {m.source_audit_source_field()}
            </p>
            <p
              class="mt-1 wrap-break-word font-mono text-label-md leading-5 font-semibold text-data-primary"
            >
              {formatFieldPath(sourceFieldPath)}
            </p>
          </div>
        {/if}
        {#if targetFieldPath}
          <div class="min-w-0 lg:text-right">
            <p
              class="font-mono text-caption font-medium tracking-[0.06em] whitespace-nowrap text-foreground-alt/75"
            >
              {m.source_audit_canonical_field()}
            </p>
            <p
              class="mt-1 wrap-break-word font-mono text-label-md leading-5 font-semibold text-primary"
            >
              {formatFieldPath(targetFieldPath)}
            </p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</ReleaseAuditCardHeader>
