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
  <section data-release-nav-domains class="flex min-h-0 flex-col pt-4">
    <h2
      class="mb-2 shrink-0 font-body text-label-md font-semibold uppercase tracking-[0.14em] text-primary"
    >
      {title}
    </h2>
    <nav class="flex min-h-0 flex-col gap-2 overflow-y-auto" aria-label={title}>
      {#each domains as domain}
        {#if domain.code === currentDomainCode}
          <span
            class="shrink-0 rounded-lg border border-outline-variant/60 bg-secondary-container px-4 py-3 font-mono text-label-md font-semibold text-primary dark:border-outline-variant dark:text-[#edf2ee]!"
            aria-current="page"
            >{domain.label}</span
          >
        {:else}
          <a
            class="shrink-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 font-mono text-label-md font-semibold text-foreground-alt transition hover:border-secondary/70 dark:border-outline-variant"
            data-sveltekit-reset="false"
            href={domain.href}
            >{domain.label}</a
          >
        {/if}
      {/each}
    </nav>
  </section>
{/if}
