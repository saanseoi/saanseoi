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
    class="xs:flex-row xs:items-center xs:justify-between xs:gap-4 flex flex-col gap-3 px-6 py-3 md:px-8"
  >
    <a
      class="group focus-visible:outline-data-primary flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
      {href}
      aria-label={title}
    >
      <div class="flex min-w-0 items-center gap-3">
        <img class="size-14 shrink-0 object-contain" src={publisherLogo} alt="">
        <div class="min-w-0">
          <p
            class="font-body text-caption text-data-primary truncate font-semibold tracking-widest uppercase"
          >
            {resourceType}
            {#if region}
              <span class="text-data-on-surface-variant"> · {region}</span>
            {/if}
          </p>
          <p
            class="font-display text-title-md text-data-on-surface mt-1 line-clamp-2 font-bold tracking-tight"
            {title}
          >
            {title}
          </p>
        </div>
      </div>
    </a>
    <div class="max-xs:hidden ml-auto">
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
