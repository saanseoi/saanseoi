<script lang="ts">
import type { ComponentProps } from 'svelte'
import type { ApiReleaseSnapshot } from '#lib/registry/types.js'
import { getApiResourceKey } from '#lib/registry/apiReleaseResourceActions.js'
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

{#if resources[0]}
  <Changes
    {...props}
    resourceLabel={resources.length > 1 && resources[0].role === 'primary'
      ? 'Primary records'
      : resourceLabel}
    resourceType={resources[0].snapshot.resourceType}
    primary={resources[0].role === 'primary'}
    toSnapshot={resources[0].snapshotId}
    comparisons={resources.map(resource => ({
      fromSnapshot: previousResources?.find(
        previous => getApiResourceKey(previous) === getApiResourceKey(resource),
      )?.snapshotId,
      toSnapshot: resource.snapshotId,
    }))}
  />
{/if}
