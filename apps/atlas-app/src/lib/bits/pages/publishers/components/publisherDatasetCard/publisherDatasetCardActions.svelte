<script lang="ts">
import Button from '#lib/bits/primitives/button/button.svelte'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  releasesHref: string
  releasesLabel: string
  catalogueHref?: string | null
  catalogueLabel: string
  schemaHref?: string | null
  schemaLabel: string
}

let {
  releasesHref,
  releasesLabel,
  catalogueHref,
  catalogueLabel,
  schemaHref,
  schemaLabel,
}: Props = $props()
</script>

<nav aria-label="Dataset links" class="flex shrink-0 flex-wrap justify-end gap-2">
  {#if catalogueHref}
    <Button
      href={catalogueHref}
      aria-label={catalogueLabel}
      title={catalogueLabel}
      class="border-data-outline-variant! bg-data-surface-container-lowest! text-data-on-surface! hover:bg-data-surface-container-high! hover:text-data-primary!"
      size="compact"
      variant="secondary"
    >
      <Icon icon="proicons:globe" class="size-4 shrink-0" aria-hidden="true" />
      <span class="max-md:sr-only">{catalogueLabel}</span>
    </Button>
  {/if}
  {#if schemaHref}
    <Button
      href={schemaHref}
      aria-label={schemaLabel}
      title={schemaLabel}
      class="border-data-outline-variant! bg-data-surface-container-lowest! text-data-on-surface! hover:bg-data-surface-container-high! hover:text-data-primary!"
      size="compact"
      variant="secondary"
    >
      <Icon icon="proicons:book-open" class="size-4 shrink-0" aria-hidden="true" />
      <span class="max-md:sr-only">{schemaLabel}</span>
    </Button>
  {/if}
  <Button
    href={releasesHref}
    aria-label={releasesLabel}
    title={releasesLabel}
    class="border-data-outline-variant! bg-data-surface-container-lowest! text-data-on-surface! hover:bg-data-surface-container-high! hover:text-data-primary!"
    size="compact"
    variant="secondary"
  >
    <Icon icon="proicons:archive" class="size-4 shrink-0" aria-hidden="true" />
    <span>{releasesLabel}</span>
  </Button>
</nav>
