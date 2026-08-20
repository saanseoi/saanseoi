<script lang="ts">
import Actions from './publisherDatasetCardActions.svelte'

type Props = {
  href: string
  resourceType: string
  region?: string
  title: string
  publisherLogo: string
  releasesHref: string
  releasesLabel: string
  catalogueHref?: string | null
  catalogueLabel: string
  schemaHref?: string | null
  schemaLabel: string
}

let {
  href,
  resourceType,
  region,
  title,
  publisherLogo,
  releasesHref,
  releasesLabel,
  catalogueHref,
  catalogueLabel,
  schemaHref,
  schemaLabel,
}: Props = $props()
</script>

<header class="bg-data-surface-container-lowest dark:border-data-outline-variant">
  <div
    class="flex flex-col gap-3 px-6 py-3 min-[30rem]:flex-row min-[30rem]:items-center min-[30rem]:justify-between min-[30rem]:gap-4 md:px-8"
  >
    <a
      class="group flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-data-primary"
      {href}
      aria-label={title}
    >
      <div class="flex min-w-0 items-center gap-3">
        <img class="size-14 shrink-0 object-contain" src={publisherLogo} alt="">
        <div class="min-w-0">
          <p
            class="truncate font-body text-caption font-semibold tracking-[0.1em] uppercase text-data-primary"
          >
            {resourceType}
            {#if region}
              <span class="text-data-on-surface-variant"> · {region}</span>
            {/if}
          </p>
          <p
            class="mt-1 line-clamp-2 font-display text-title-md font-bold tracking-tight text-data-on-surface"
            {title}
          >
            {title}
          </p>
        </div>
      </div>
    </a>
    <div class="ml-auto max-[30rem]:hidden">
      <Actions
        {releasesHref}
        {releasesLabel}
        {catalogueHref}
        {catalogueLabel}
        {schemaHref}
        {schemaLabel}
      />
    </div>
  </div>
</header>
