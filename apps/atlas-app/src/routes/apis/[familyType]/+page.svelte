<script lang="ts">
import { Main } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'
import { getApiFamilyPageData } from '$lib/registry/meta.remote'

let { params } = $props()
let data = $derived(await getApiFamilyPageData(params.familyType))
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8">
  <h1 class="font-display text-headline-lg font-bold text-primary">
    {data.api.familyType}
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.api_family_no_release_notes()}
  </p>
</Main>
