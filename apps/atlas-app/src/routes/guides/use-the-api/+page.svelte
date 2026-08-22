<script lang="ts">
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { m } from '#lib/bits/internal/i18n.js'

import GuideUseTheApiPlaceholder from './guideUseTheApiPlaceholder.svelte'
import GuideUseTheApiReleaseNotes from './guideUseTheApiReleaseNotes.svelte'

let { data } = $props()
</script>

<Seo
  title={m.guide_use_api_title()}
  description={m.guide_use_api_meta_description()}
  image="/guides/data-from-api-light.webp"
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <GuideUseTheApiPlaceholder />
  <GuideUseTheApiReleaseNotes apiFamilies={data.apiFamilies} />
</Main>
