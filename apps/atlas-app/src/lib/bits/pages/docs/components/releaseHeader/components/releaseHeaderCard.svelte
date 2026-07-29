<script lang="ts">
import Icon from '@iconify/svelte'

type Link = {
  href: string
  icon: string
  label: string
  isExternal?: boolean
}

type Props = {
  title: string
  name: string
  href: string
  imageSrc?: string
  description?: string | null
  primaryLinks?: Link[]
  secondaryLinks?: Link[]
}

let {
  title,
  name,
  href,
  imageSrc,
  description,
  primaryLinks = [],
  secondaryLinks = [],
}: Props = $props()
</script>

<aside
  class="self-start rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 dark:border-outline-variant"
>
  <div>
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt"
    >
      {title}
    </p>
    <a
      class="mt-3 flex items-center gap-3 rounded-md text-primary transition hover:text-secondary"
      {href}
    >
      {#if imageSrc}
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-md border border-outline-variant/60 bg-surface-container-lowest p-2 dark:border-outline-variant"
        >
          <img class="max-h-full max-w-full object-contain" src={imageSrc} alt="">
        </span>
      {/if}
      <span class="font-body text-label-md font-semibold leading-5">{name}</span>
      <Icon
        icon="ion:arrow-forward-outline"
        class="ml-auto size-4 shrink-0"
        aria-hidden="true"
      />
    </a>
    {#if description}
      <p class="mt-3 font-body text-sm text-label-sm leading-5 text-foreground-alt">
        {description}
      </p>
    {/if}
  </div>
  {#if primaryLinks.length || secondaryLinks.length}
    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        {#each primaryLinks as link}
          <a
            class="inline-flex items-center gap-1 font-body text-label-sm font-semibold text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
            href={link.href}
            target={link.isExternal ? '_blank' : undefined}
            rel={link.isExternal ? 'noopener noreferrer' : undefined}
          >
            <Icon icon={link.icon} class="size-4" aria-hidden="true" />
            {link.label}
          </a>
        {/each}
      </div>
      {#each secondaryLinks as link}
        <a
          class="inline-flex items-center gap-1 font-body text-label-sm font-semibold text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
          href={link.href}
          target={link.isExternal ? '_blank' : undefined}
          rel={link.isExternal ? 'noopener noreferrer' : undefined}
        >
          {link.label}
          <Icon icon={link.icon} class="size-4" aria-hidden="true" />
        </a>
      {/each}
    </div>
  {/if}
</aside>
