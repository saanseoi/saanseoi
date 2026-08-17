<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { tick } from 'svelte'
import { m } from '#lib/bits/internal/i18n.js'
import type { ReleaseNavVersion } from '../releaseNav.types'

type Props = { currentVersionCode: string; versions: ReleaseNavVersion[] }
let { currentVersionCode, versions }: Props = $props()
let open = $state(false)
let activeVersion = $derived(
  versions.find(version => version.code === currentVersionCode),
)

async function toggle() {
  open = !open
  if (!open) return
  await tick()
  const list = document.getElementById('source-release-mobile-versions')
  const current = list?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!list || !current) return
  list.scrollTop = Math.min(
    Math.max(0, list.scrollHeight - list.clientHeight),
    Math.max(0, current.offsetTop - (list.clientHeight - current.offsetHeight) / 2),
  )
}

function close() {
  open = false
}
</script>

{#if activeVersion}
  <div class="relative">
    <button
      class="relative z-30 flex h-12 w-full min-w-0 items-center justify-between gap-4 border-b border-outline-variant/60 bg-surface-container-low px-4 py-3 text-left font-mono text-label-md font-semibold text-primary dark:border-outline-variant"
      type="button"
      aria-controls="source-release-mobile-versions"
      aria-expanded={open}
      onclick={toggle}
    >
      <span class="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        >{m.source_mobile_version()}: {activeVersion.label || currentVersionCode}</span
      >
      <Icon
        icon="ion:chevron-down-outline"
        class={`size-4 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
    {#if open}
      <button
        class="fixed inset-0 z-20 bg-black/40"
        type="button"
        aria-label="Close version navigation"
        onclick={close}
      ></button>
      <nav
        id="source-release-mobile-versions"
        class="absolute inset-x-0 top-full z-40 grid max-h-[min(24rem,calc(100svh-8rem))] gap-2 overflow-y-auto rounded-b-lg border border-outline-variant/60 bg-surface-container-low p-3 shadow-popover dark:border-outline-variant"
        aria-label={m.source_versions_nav()}
      >
        {#each versions as version}
          <a
            class={`flex items-center justify-between rounded-md border px-3 py-2.5 font-mono text-label-md font-semibold transition ${version.code === currentVersionCode ? 'border-secondary/70 bg-secondary-container text-primary dark:text-[#edf2ee]!' : 'border-outline-variant/60 bg-surface-container-lowest text-foreground-alt hover:border-secondary/70 dark:border-outline-variant'}`}
            data-sveltekit-reset="false"
            href={version.href}
            aria-current={version.code === currentVersionCode ? 'page' : undefined}
            onclick={close}
          >
            {version.label || version.code}
            {#if version.code === currentVersionCode}
              <Icon icon="ion:checkmark-outline" class="size-4" aria-hidden="true" />
            {/if}
          </a>
        {/each}
      </nav>
    {/if}
  </div>
{/if}
