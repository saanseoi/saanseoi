<script lang="ts">
import type { ReleaseNavDomain } from '../releaseNav.types'

type Props = {
  currentDomainCode?: string
  domains: ReleaseNavDomain[]
  title: string
}
let { currentDomainCode, domains, title }: Props = $props()
</script>

{#if domains.length}
  <section class="shrink-0 pt-4">
    <h2
      class="mb-2 font-body text-label-md font-semibold uppercase tracking-[0.14em] text-primary"
    >
      {title}
    </h2>
    <nav class="flex flex-col gap-2" aria-label={title}>
      {#each domains as domain}
        {#if domain.code === currentDomainCode}
          <span
            class="rounded-lg border border-outline-variant/60 bg-secondary-container px-4 py-3 font-mono text-label-md font-semibold text-primary dark:border-outline-variant dark:text-[#edf2ee]!"
            aria-current="page"
            >{domain.label}</span
          >
        {:else}
          <a
            class="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 font-mono text-label-md font-semibold text-foreground-alt transition hover:border-secondary/70 dark:border-outline-variant"
            data-sveltekit-noscroll
            href={domain.href}
            >{domain.label}</a
          >
        {/if}
      {/each}
    </nav>
  </section>
{/if}
