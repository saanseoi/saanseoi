<script lang="ts">
import Button from '#lib/bits/primitives/button/button.svelte'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Link = {
  href: string
  icon: string
  label: string
  isExternal?: boolean
}

type Props = {
  title?: string | null
  name: string
  href: string
  imageSrc?: string
  description?: string | null
  primaryLinks?: Link[]
  secondaryLinks?: Link[]
  showArrow?: boolean
}

let {
  title,
  name,
  href,
  imageSrc,
  description,
  primaryLinks = [],
  secondaryLinks = [],
  showArrow = true,
}: Props = $props()
</script>

<aside
  class="self-start rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 dark:border-outline-variant"
>
  <div>
    {#if title}
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt"
      >
        {title}
      </p>
    {/if}
    <a
      class={`${title ? 'mt-3' : ''} flex items-center gap-3 rounded-md text-primary transition hover:text-secondary`}
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
      {#if showArrow}
        <Icon
          icon="ion:arrow-forward-outline"
          class="ml-auto size-4 shrink-0"
          aria-hidden="true"
        />
      {/if}
    </a>
    {#if description}
      <p class="mt-3 font-body text-sm text-label-sm leading-5 text-foreground-alt">
        {description}
      </p>
    {/if}
  </div>
  {#if primaryLinks.length || secondaryLinks.length}
    <nav aria-label="Publisher links" class="mt-5 grid grid-cols-2 gap-2">
      {#each primaryLinks as link}
        <Button
          href={link.href}
          class="w-full min-w-0 px-1.5!"
          size="compact"
          variant="secondary"
          target={link.isExternal ? '_blank' : undefined}
        >
          <Icon icon={link.icon} class="size-4" aria-hidden="true" />
          {link.label}
        </Button>
      {/each}
      {#each secondaryLinks as link}
        <Button
          href={link.href}
          class="w-full min-w-0 px-1.5!"
          size="compact"
          variant="secondary"
          target={link.isExternal ? '_blank' : undefined}
        >
          <Icon icon={link.icon} class="size-4" aria-hidden="true" />
          {link.label}
        </Button>
      {/each}
    </nav>
  {/if}
</aside>
