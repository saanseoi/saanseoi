<script lang="ts">
import {
  GuideEyebrow,
  GuideFoundations,
  GuideLayout,
  GuideParagraph,
  GuideTitle,
} from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'

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

<div>
  <GuideLayout width="content">
    <header>
      <GuideEyebrow text={m.guide_create_map_eyebrow()} />
      <GuideTitle title={m.guide_create_map_hero()} class="mt-3" />
      <GuideParagraph class="mt-5">{@html m.guide_create_map_intro()}</GuideParagraph>
    </header>
  </GuideLayout>
  <GuideFoundations
    title={m.guide_foundations_title()}
    description={m.guide_foundations_description()}
    items={foundations}
  />
</div>
