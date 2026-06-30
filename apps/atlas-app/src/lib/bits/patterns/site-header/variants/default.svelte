<script lang="ts" module>
import { addCollection } from '@iconify/svelte'
import { icons as proicons } from '@iconify-json/proicons'
import { icons as ionicons } from '@iconify-json/ion'

addCollection(proicons)
addCollection(ionicons)
</script>

<script lang="ts">
import HeaderActions from '../components/headerActions.svelte'
import PrimaryNavigation from '../components/primaryNavigation.svelte'
import SiteBrand from '../components/siteBrand.svelte'
</script>

<header
  class="sticky top-0 z-30 border-b border-border-card/55 bg-background text-foreground"
>
  <div
    class="mx-auto flex max-w-(--spacing-container-max) items-center justify-between gap-4 px-(--spacing-margin-mobile) py-5 @container mobile:grid mobile:grid-cols-[1fr_auto_1fr] mobile:px-8 xl:px-(--spacing-margin-desktop)"
  >
    <SiteBrand />
    <PrimaryNavigation />
    <HeaderActions />
  </div>
</header>
