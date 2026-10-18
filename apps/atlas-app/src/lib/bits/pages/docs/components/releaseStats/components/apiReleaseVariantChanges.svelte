<script lang="ts">
import type { ComponentProps } from 'svelte'
import type { ApiReleaseSnapshot } from '#lib/registry/types.js'
import {
  getApiResourceKey,
  getApiResourceVariantLabel,
} from '#lib/registry/apiReleaseResourceActions.js'
import Changes from './apiReleaseChanges.svelte'

let {
  resources,
  previousResources,
  resourceLabel,
  ...props
}: Omit<
  ComponentProps<typeof Changes>,
  'fromSnapshot' | 'toSnapshot' | 'primary' | 'resourceType'
> & {
  resources: ApiReleaseSnapshot[]
  previousResources?: ApiReleaseSnapshot[]
} = $props()
</script>

<div class="space-y-8">
  {#each resources as resource (getApiResourceKey(resource))}
    <section
      class="space-y-3"
      aria-label={getApiResourceVariantLabel(resource.variant)}
    >
      {#if resources.length > 1}
        <h2 class="font-body text-title-md font-semibold text-primary">
          {getApiResourceVariantLabel(resource.variant)}
        </h2>
      {/if}
      <Changes
        {...props}
        resourceLabel={resources.length > 1
          ? `${resourceLabel} · ${getApiResourceVariantLabel(resource.variant)}`
          : resourceLabel}
        resourceType={resource.snapshot.resourceType}
        primary={resource.role === 'primary'}
        fromSnapshot={previousResources?.find(
          previous => getApiResourceKey(previous) === getApiResourceKey(resource),
        )?.snapshotId}
        toSnapshot={resource.snapshotId}
      />
    </section>
  {/each}
</div>
