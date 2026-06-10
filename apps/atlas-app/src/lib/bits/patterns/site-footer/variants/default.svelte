<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '$lib/bits/internal/i18n'

const resourceLinks = [
  { href: '/manifesto', label: () => m.manifesto_title() },
  {
    href: 'https://portal.csdi.gov.hk/geoportal/#searchPanel',
    label: () => m.footer_resource_csdi(),
  },
  { href: 'https://data.gov.hk/', label: () => m.footer_resource_data_gov() },
] as const

const networkLinks = [
  {
    href: 'https://github.com/saanseoi',
    label: () => m.footer_network_github(),
    icon: 'proicons:github',
  },
  {
    href: 'http://instagr.am/saanseoi',
    label: () => m.footer_network_instagram(),
    icon: 'proicons:instagram',
  },
  {
    href: 'mailto:hi@saanseoi.hk',
    label: () => m.footer_network_contact(),
    icon: 'proicons:mail',
  },
] as const
</script>

<footer class="border-t border-border-card/60 bg-muted/55">
  <div
    class="mx-auto grid max-w-(--spacing-container-max) gap-12 px-(--spacing-margin-mobile) py-12 md:px-8 lg:grid-cols-[1.2fr_1fr_1fr] xl:px-(--spacing-margin-desktop)"
  >
    <div class="space-y-5">
      <a class="inline-flex items-center gap-3 text-foreground" href="/">
        <span class="font-display text-[1.7rem] leading-none tracking-tighter"
          >山水</span
        >
        <span class="h-7 w-px bg-border-card"></span>
        <span
          class="font-display text-[1.7rem] font-bold leading-none tracking-display-md"
        >
          SaanSeoi
        </span>
      </a>
      <p class="max-w-92 font-body text-[0.98rem] leading-[1.8] text-foreground-alt">
        {m.footer_description()}
      </p>
      <p
        class="font-body text-[0.83rem] font-bold uppercase tracking-[0.08em] text-foreground"
      >
        {m.designed_in_hk()}
      </p>
    </div>

    <div>
      <h3
        class="font-body text-[0.84rem] font-bold uppercase tracking-[0.08em] text-foreground-alt"
      >
        {m.footer_resources_heading()}
      </h3>
      <div class="mt-5 flex flex-col gap-3">
        {#each resourceLinks as link}
          <a
            class="font-body text-[0.98rem] leading-[1.7] text-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
            href={link.href}
          >
            {link.label()}
          </a>
        {/each}
      </div>
    </div>

    <div>
      <h3
        class="font-body text-[0.84rem] font-bold uppercase tracking-[0.08em] text-foreground-alt"
      >
        {m.footer_network_heading()}
      </h3>
      <div class="mt-5 flex flex-col gap-3">
        {#each networkLinks as link}
          <a
            class="inline-flex items-center gap-2 font-body text-[0.98rem] leading-[1.7] text-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
            href={link.href}
          >
            <Icon icon={link.icon} class="size-4" />
            {link.label()}
          </a>
        {/each}
      </div>
    </div>
  </div>

  <div
    class="mx-auto flex max-w-(--spacing-container-max) flex-col gap-4 border-t border-border-card/60 px-(--spacing-margin-mobile) py-5 font-body text-[0.78rem] text-foreground-alt md:flex-row md:items-center md:justify-between md:px-8 xl:px-(--spacing-margin-desktop)"
  >
    <p>{@html m.footer_copyright()}</p>
    <div class="flex flex-wrap gap-5">
      <a class="transition-colors hover:text-primary" href="/policy/privacy"
        >{m.footer_privacy()}</a
      >
      <a class="transition-colors hover:text-primary" href="/policy/terms"
        >{m.footer_terms()}</a
      >
      <a class="transition-colors hover:text-primary" href="/policy/accessibility"
        >{m.footer_accessibility()}</a
      >
    </div>
  </div>
</footer>
