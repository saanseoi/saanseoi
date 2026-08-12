<script lang="ts">
import { GuideFoundations } from '$lib/bits/pages/guides'
import { PageDescription, PageHeader, PageTitle } from '$lib/bits/pages/shared'
import { m } from '$lib/bits/internal/i18n'

type Foundation = {
  description: string
  href: string
  image: string
  title: string
}

type Props = {
  foundations: Foundation[]
}

let { foundations }: Props = $props()
</script>

<div class="max-w-4xl">
  <PageHeader>
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {@html m.guide_create_map_eyebrow()}
    </p>
    <PageTitle class="mt-3">{@html m.guide_create_map_hero()}</PageTitle>
    <PageDescription class="mt-5">{@html m.guide_create_map_intro()}</PageDescription>
  </PageHeader>
  <GuideFoundations
    title={m.guide_foundations_title()}
    description={m.guide_foundations_description()}
    items={foundations}
  />
</div>
