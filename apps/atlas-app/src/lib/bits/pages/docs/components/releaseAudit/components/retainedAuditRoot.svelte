<script lang="ts">
import type { Snippet } from 'svelte'
import { getRetainedSourceAudit } from '#lib/registry/audit.remote'
import RetainedAuditRelease from './retainedAuditRelease.svelte'
let {
  datasetCode,
  releaseCode,
  children,
}: { datasetCode: string; releaseCode: string; children?: Snippet } = $props()
let audit = $derived(getRetainedSourceAudit({ datasetCode, releaseCode }))
</script>

{#if audit.error}
  <p role="alert">
    Unable to load the retained audit.
    <button type="button" class="underline" onclick={() => audit.refresh()}>
      Retry
    </button>
  </p>
{:else if !audit.ready}
  <p class="py-4 text-sm opacity-60">Loading audit summaries…</p>
{:else if audit.current.length}
  <div class="space-y-8">
    {#each audit.current as resource (resource.releaseId)}
      <RetainedAuditRelease
        manifest={resource.manifest}
        hash={resource.hash}
        resourceType={resource.resourceType}
      />
    {/each}
  </div>
{:else}
  {@render children?.()}
{/if}
