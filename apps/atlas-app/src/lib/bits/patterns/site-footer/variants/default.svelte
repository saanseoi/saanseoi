<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '#lib/bits/internal/i18n.js'

const resourceLinks = [
  {
    href: '/manifesto',
    label: () => m.manifesto_title(),
    icon: 'hugeicons:scroll-01',
  },
  {
    href: 'https://portal.csdi.gov.hk/geoportal/#searchPanel',
    label: () => m.footer_resource_csdi(),
    icon: 'emojione-monotone:flag-for-hong-kong-sar-china',
  },
  {
    href: 'https://data.gov.hk/',
    label: () => m.footer_resource_data_gov(),
    icon: 'emojione-monotone:flag-for-hong-kong-sar-china',
  },
] as const

const socialLinks = [
  {
    href: 'https://www.instagram.com/saanseoi/',
    label: () => m.footer_social_instagram(),
    icon: 'simple-icons:instagram',
  },
  {
    href: 'https://www.threads.com/@saanseoi',
    label: () => m.footer_social_threads(),
    icon: 'simple-icons:threads',
  },
  {
    href: 'https://www.linkedin.com/company/saanseoi',
    label: () => m.footer_social_linkedin(),
    icon: 'simple-icons:linkedin',
  },
] as const

const networkLinks = [
  {
    href: 'https://discord.gg/thXu6psten',
    label: () => m.footer_network_discord(),
    icon: 'simple-icons:discord',
  },
  {
    href: 'https://github.com/saanseoi',
    label: () => m.footer_network_codebase(),
    icon: 'proicons:github',
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
    class="mx-auto grid grid-cols-2 gap-x-4 gap-y-12 max-w-(--spacing-container-max) px-(--spacing-margin-md) py-12 md:px-8 min-[900px]:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr] xl:px-(--spacing-margin-xl)"
  >
    <div class="col-span-2 space-y-5 min-[900px]:col-span-1">
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

    <div class="hidden min-[900px]:block">
      <h3
        class="font-body text-[0.84rem] font-bold uppercase tracking-[0.08em] text-foreground-alt"
      >
        {m.footer_resources_heading()}
      </h3>
      <div class="mt-5 flex flex-col gap-3">
        {#each resourceLinks as link}
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

    <div>
      <h3
        class="font-body text-[0.84rem] font-bold uppercase tracking-[0.08em] text-foreground-alt"
      >
        {m.footer_socials_heading()}
      </h3>
      <div class="mt-5 flex flex-col gap-3">
        {#each socialLinks as link}
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
    class="mx-auto flex max-w-(--spacing-container-max) flex-col gap-4 border-t border-border-card/60 px-(--spacing-margin-md) py-5 font-body text-[0.78rem] text-foreground-alt md:flex-row md:items-center md:justify-between md:px-8 xl:px-(--spacing-margin-xl)"
  >
    <p>{@html m.footer_copyright()}</p>
    <div class="flex flex-wrap gap-5">
      <a class="transition-colors hover:text-primary" href="/policy/privacy"
        >{m.footer_privacy()}</a
      >
      <a class="transition-colors hover:text-primary" href="/policy/terms"
        >{m.footer_terms()}</a
      >
      <a class="transition-colors hover:text-primary" href="/policy/fair-use"
        >{m.footer_fair_use()}</a
      >
      <a class="transition-colors hover:text-primary" href="/policy/accessibility"
        >{m.footer_accessibility()}</a
      >
    </div>
  </div>
</footer>
