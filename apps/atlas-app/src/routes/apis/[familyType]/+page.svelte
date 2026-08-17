<script lang="ts">
import { Main } from '#lib/bits/primitives/main/index.js'
import { m } from '#lib/bits/internal/i18n.js'

let { data } = $props()
let apiFamilyPageData = $derived(data.apiFamilyPageData)
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8">
  <h1 class="font-display text-headline-lg font-bold text-primary">
    {apiFamilyPageData.api.familyType}
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.api_family_no_release_notes()}
  </p>
</Main>
