<script lang="ts">
import { GuideInstructionCallout } from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

type HostingPlatform = Extract<
  CreateAMapSelectionQuery['hosting'],
  'cloudflare' | 'github-pages' | 'vercel' | 'netlify'
>

type Props = {
  hostingPlatform: HostingPlatform
}

let { hostingPlatform }: Props = $props()

const label = $derived(
  hostingPlatform === 'cloudflare'
    ? m.guide_publish_workers_static_assets_label()
    : hostingPlatform === 'github-pages'
      ? m.guide_publish_github_branch_label()
      : m.guide_publish_linked_project_label(),
)
const title = $derived(
  hostingPlatform === 'cloudflare'
    ? m.guide_publish_workers_static_assets_title()
    : hostingPlatform === 'github-pages'
      ? m.guide_publish_github_branch_title()
      : m.guide_publish_linked_project_title(),
)
const description = $derived(
  hostingPlatform === 'cloudflare'
    ? m.guide_publish_workers_static_assets_description()
    : hostingPlatform === 'github-pages'
      ? m.guide_publish_github_branch_description()
      : hostingPlatform === 'vercel'
        ? m.guide_publish_vercel_linked_project_description()
        : m.guide_publish_netlify_linked_project_description(),
)
</script>

<GuideInstructionCallout {description} {label} {title} />
