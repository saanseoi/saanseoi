<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditCardHeader from './releaseAuditCardHeader.svelte'

type Props = {
  condition?: string
  description?: string
  headingId: string
  sourceFieldPath?: string
  sourceReleaseCode?: string
  targetFieldPath?: string
  title: string
}

let {
  condition,
  description,
  headingId,
  sourceFieldPath,
  sourceReleaseCode,
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

{#snippet aside()}
  {#if sourceFieldPath || targetFieldPath}
    <div
      class="flex flex-col items-start gap-3 text-left sm:flex-row sm:flex-wrap sm:justify-end sm:gap-x-8 sm:gap-y-3 sm:text-right"
    >
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
  {#if condition}
    <div class="mt-5 border-l border-data-outline-variant/60 pl-6 text-left">
      <p
        class="font-mono text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
      >
        {m.source_audit_condition()}
      </p>
      <p class="mt-2 font-body text-label-md leading-6 text-primary">{condition}</p>
    </div>
  {/if}
{/snippet}

<ReleaseAuditCardHeader
  {aside}
  asideClass={condition ? 'sm:w-1/2' : ''}
  mobileAsideAfter
>
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
    {#if condition}
      <p
        class="mt-4 font-mono text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
      >
        Description
      </p>
    {/if}
    <p class="mt-2 font-body text-label-md leading-6 text-primary">{description}</p>
  {/if}
  {#if sourceReleaseCode}
    <p class="mt-4 font-mono text-caption text-foreground-alt">
      {m.reference_source_release()}: {sourceReleaseCode}
    </p>
  {/if}
</ReleaseAuditCardHeader>
