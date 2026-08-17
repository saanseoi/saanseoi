<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import type { ReleaseNavVersion, ReleaseNavVersionPreload } from '../releaseNav.types'

type Props = {
  currentVersionCode: string
  onVersionPreload?: ReleaseNavVersionPreload
  versions: ReleaseNavVersion[]
}
let { currentVersionCode, onVersionPreload, versions }: Props = $props()
let currentVersionIndex = $derived(
  versions.findIndex(version => version.code === currentVersionCode),
)
let controls = $derived([
  {
    icon: 'ion:chevron-back-outline',
    label: 'Newer',
    version: versions[currentVersionIndex - 1],
  },
  {
    icon: 'ion:chevron-forward-outline',
    label: 'Older',
    version: versions[currentVersionIndex + 1],
  },
])
</script>

<div class="flex items-center gap-1">
  {#each controls as item}
    {#if item.version}
      <a
        class="inline-flex size-7 items-center justify-center rounded-default border border-data-outline-variant/60 bg-data-surface-container-lowest text-data-primary transition hover:border-data-primary hover:bg-data-surface-container-high"
        data-sveltekit-reset="false"
        data-sveltekit-preload-data="hover"
        href={item.version.href}
        aria-label={`${item.label} release: ${item.version.label}`}
        onfocusin={() => onVersionPreload?.(item.version)}
        onpointerenter={() => onVersionPreload?.(item.version)}
      >
        <Icon icon={item.icon} class="size-4" aria-hidden="true" />
      </a>
    {:else}
      <span
        class="inline-flex size-7 items-center justify-center rounded-default border border-data-outline-variant/40 text-foreground-alt/40"
        aria-hidden="true"
        ><Icon icon={item.icon} class="size-4" /></span
      >
    {/if}
  {/each}
</div>
