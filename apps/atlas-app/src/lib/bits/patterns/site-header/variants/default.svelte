<script lang="ts" module>
import { addCollection } from '@iconify/svelte'
import { icons as proicons } from '@iconify-json/proicons'

addCollection(proicons)
</script>

<script lang="ts">
import HeaderActions from '../components/header-actions.svelte'
import PrimaryNavigation from '../components/primary-navigation.svelte'
import SiteBrand from '../components/site-brand.svelte'
</script>

<header
  class="sticky top-0 z-30 border-b border-border-card/55 bg-background text-foreground"
>
  <div
    class="mx-auto flex max-w-[var(--spacing-container-max)] items-center justify-between gap-4 px-[var(--spacing-margin-mobile)] py-5 md:grid md:grid-cols-[1fr_auto_1fr] md:px-8 xl:px-[var(--spacing-margin-desktop)]"
  >
    <SiteBrand />
    <PrimaryNavigation />
    <HeaderActions />
  </div>
</header>
