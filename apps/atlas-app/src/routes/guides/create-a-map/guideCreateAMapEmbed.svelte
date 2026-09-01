<script lang="ts">
import {
  GuideCodeBlock,
  GuideAdmonition,
  GuideChoiceGroup,
  GuideInstructionCallout,
  GuideParagraph,
  GuideSection,
  GuideSubSectionHeader,
} from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import type { CreateAMapSelectionValue } from '#lib/guides/createAMapSelections.js'

import {
  createMapIframeCode,
  embedElementName,
  normalisePublishedMapUrl,
  type EmbedHeight,
} from './createAMapEmbed'

type Hosting = CreateAMapSelectionValue<'hosting'>
type Platform = CreateAMapSelectionValue<'websitePlatform'>
type PreviewState = 'idle' | 'loading' | 'loaded' | 'timeout' | 'error'

type Props = {
  hosting: Hosting
  platform: Platform
  platformLabel: string
  published: boolean
}

let { hosting, platform, platformLabel, published }: Props = $props()

let mapUrl = $state('')
let mapTitle = $state('')
let heightMode = $state<'fixed' | 'fill'>('fixed')
let heightPixels = $state(600)
let previewUrl = $state<string>()
let previewState = $state<PreviewState>('idle')
let wordpressKind = $state<'self-hosted' | 'wordpress-com'>('self-hosted')
let previewTimer: ReturnType<typeof setTimeout> | undefined

const wordpressKindChoices = $derived([
  {
    value: 'self-hosted',
    label: m.guide_embed_wordpress_self_hosted(),
    description: m.guide_embed_wordpress_self_hosted_description(),
    icon: 'proicons:server',
  },
  {
    value: 'wordpress-com',
    label: m.guide_embed_wordpress_com(),
    description: m.guide_embed_wordpress_com_description(),
    icon: 'simple-icons:wordpress',
  },
])

const placementSteps = $derived(
  platform === 'wordpress'
    ? [
        m.guide_embed_flow_wordpress_open(),
        m.guide_embed_flow_wordpress_add(),
        m.guide_embed_flow_wordpress_paste(),
        m.guide_embed_flow_wordpress_preview(),
        m.guide_embed_flow_wordpress_publish(),
      ]
    : platform === 'squarespace'
      ? [
          m.guide_embed_flow_squarespace_open(),
          m.guide_embed_flow_squarespace_add(),
          m.guide_embed_flow_squarespace_html(),
          m.guide_embed_flow_squarespace_paste(),
          m.guide_embed_flow_squarespace_publish(),
        ]
      : platform === 'wix'
        ? [
            m.guide_embed_flow_wix_open(),
            m.guide_embed_flow_wix_add(),
            m.guide_embed_flow_wix_choose(),
            m.guide_embed_flow_wix_apply(),
            m.guide_embed_flow_wix_publish(),
          ]
        : platform === 'webflow'
          ? [
              m.guide_embed_flow_webflow_open(),
              m.guide_embed_flow_webflow_add(),
              m.guide_embed_flow_webflow_position(),
              m.guide_embed_flow_webflow_save(),
              m.guide_embed_flow_webflow_publish(),
            ]
          : [
              m.guide_embed_illustration_edit(),
              embedElementName(platform),
              m.guide_embed_illustration_publish(),
            ],
)
const embedRequirementTotal = $derived(platform === 'wordpress' ? 3 : 2)
const codeRequirement = $derived({
  current: platform === 'wordpress' ? 2 : 1,
  label: m.guide_prerequisites_requirement_label(),
  total: embedRequirementTotal,
})
const placementRequirement = $derived({
  current: embedRequirementTotal,
  label: m.guide_prerequisites_requirement_label(),
  total: embedRequirementTotal,
})

const normalisedUrl = $derived(normalisePublishedMapUrl(mapUrl))
const height = $derived<EmbedHeight>(
  heightMode === 'fill'
    ? { mode: 'fill' }
    : { mode: 'fixed', pixels: Math.min(1600, Math.max(240, heightPixels || 600)) },
)
const iframeCode = $derived(
  createMapIframeCode({ height, title: mapTitle, url: mapUrl }),
)
const elementName = $derived(embedElementName(platform))
const previewHeight = $derived(height.mode === 'fixed' ? `${height.pixels}px` : '70dvh')
const siteBuilderHelp = $derived(
  platform === 'wordpress'
    ? wordpressKind === 'wordpress-com'
      ? m.guide_embed_site_builder_wordpress_com_help()
      : m.guide_embed_site_builder_wordpress_self_hosted_help()
    : platform === 'squarespace'
      ? m.guide_embed_site_builder_squarespace_help()
      : platform === 'wix'
        ? m.guide_embed_site_builder_wix_help()
        : platform === 'webflow'
          ? m.guide_embed_site_builder_webflow_help()
          : m.guide_embed_site_builder_other_help({ element: elementName }),
)

const officialGuideUrl = $derived(
  platform === 'wordpress'
    ? 'https://wordpress.com/support/wordpress-editor/blocks/custom-html-block/'
    : platform === 'squarespace'
      ? 'https://support.squarespace.com/hc/en-us/articles/206543167-Code-blocks'
      : platform === 'wix'
        ? 'https://support.wix.com/en/article/wix-editor-embedding-a-site-or-a-widget'
        : platform === 'webflow'
          ? 'https://help.webflow.com/hc/en-us/articles/33961234953107-Custom-code-embed'
          : undefined,
)

const clearPreviewTimer = () => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = undefined
}

const showPreview = () => {
  if (!published || !normalisedUrl) return
  clearPreviewTimer()
  previewState = 'loading'
  previewUrl = normalisedUrl
  previewTimer = setTimeout(() => {
    if (previewState === 'loading') previewState = 'timeout'
  }, 12_000)
}

const markPreviewLoaded = () => {
  clearPreviewTimer()
  previewState = 'loaded'
}

$effect(() => {
  mapUrl
  previewUrl = undefined
  previewState = 'idle'
  clearPreviewTimer()
})

$effect(() => () => clearPreviewTimer())
</script>

<GuideSection
  id="embed"
  number={8}
  showBorder={false}
  eyebrow={m.guide_embed_section_eyebrow({ platform: platformLabel })}
>
  <div class="mt-3 space-y-5">
    <GuideParagraph>
      {@html m.guide_embed_section_description({ platform: platformLabel })}
    </GuideParagraph>
    <GuideParagraph>
      {@html m.guide_embed_section_platform_method({
        element: elementName,
        platform: platformLabel,
      })}
      {#if officialGuideUrl}
        <a
          class="font-semibold text-secondary underline underline-offset-4"
          href={officialGuideUrl}
          target="_blank"
          rel="noreferrer"
          >{m.guide_embed_official_guide({ platform: platformLabel })}</a
        >.
      {:else}
        {m.guide_embed_other_docs()}.
      {/if}
    </GuideParagraph>
  </div>

  {#if platform === 'wordpress'}
    <GuideChoiceGroup
      alignment="left"
      label={m.guide_embed_wordpress_kind_title()}
      marker={{
        current: 1,
        label: m.guide_prerequisites_requirement_label(),
        total: embedRequirementTotal,
      }}
      hint={m.guide_embed_wordpress_kind_description()}
      choices={wordpressKindChoices}
      bind:value={wordpressKind}
      illustratedCardSizing="fixed"
      illustratedFitWhenPossible
      variant="illustrated"
    />
    {#if wordpressKind === 'wordpress-com'}
      <GuideAdmonition
        class="mt-6 max-w-[58rem]"
        id="wordpress-com-iframe-permissions"
        title={m.guide_embed_wordpress_com_limit_title()}
        expanded
      >
        <GuideParagraph>
          {m.guide_embed_wordpress_com_limit()}
        </GuideParagraph>
      </GuideAdmonition>
    {/if}
  {/if}

  <section class="mt-10" aria-labelledby="embed-code-title">
    <GuideSubSectionHeader
      id="embed-code-title"
      requirement={codeRequirement}
      title={m.guide_embed_code_title()}
    />
    <GuideParagraph class="mt-3">
      {m.guide_embed_preview_description()}
    </GuideParagraph>

    <div class="mt-8 max-w-[58rem] px-4 md:px-16">
      <div class="grid gap-6 sm:grid-cols-2">
        <label class="sm:col-span-2">
          <span class="font-body text-body-md font-bold text-primary">
            {m.guide_embed_map_url_label()}
          </span>
          <input
            class="mt-2 w-full border border-border-card bg-background px-5 py-4 font-body text-body-lg text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
            type="url"
            inputmode="url"
            autocomplete="url"
            placeholder="https://your-published-map.example/"
            bind:value={mapUrl}
          >
          {#if mapUrl && !normalisedUrl}
            <span class="mt-2 block font-body text-label-md text-destructive">
              {m.guide_embed_map_url_error()}
            </span>
          {/if}
        </label>

        <label class="sm:col-span-2">
          <span class="font-body text-body-md font-bold text-primary">
            {m.guide_embed_map_title_label()}
          </span>
          <input
            class="mt-2 w-full border border-border-card bg-background px-5 py-4 font-body text-body-lg text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
            type="text"
            placeholder={m.guide_embed_map_title_placeholder()}
            bind:value={mapTitle}
          >
          <span class="mt-2 block font-body text-body-md leading-6 text-foreground-alt">
            {m.guide_embed_map_title_hint()}
          </span>
        </label>

        <fieldset>
          <legend class="font-body text-body-md font-bold text-primary">
            {m.guide_embed_height_label()}
          </legend>
          <div class="mt-3 flex flex-wrap gap-3">
            <label
              class="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-body text-body-lg font-medium text-foreground-alt"
            >
              <input class="size-5" bind:group={heightMode} type="radio" value="fixed">
              {m.guide_embed_height_fixed()}
            </label>
            <label
              class="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-body text-body-lg font-medium text-foreground-alt"
            >
              <input class="size-5" bind:group={heightMode} type="radio" value="fill">
              {m.guide_embed_height_fill()}
            </label>
          </div>
        </fieldset>

        {#if heightMode === 'fixed'}
          <label>
            <span class="font-body text-body-md font-bold text-primary">
              {m.guide_embed_height_pixels()}
            </span>
            <input
              class="mt-2 w-full border border-border-card bg-background px-5 py-4 font-body text-body-lg text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
              type="number"
              min="240"
              max="1600"
              step="20"
              bind:value={heightPixels}
            >
          </label>
        {:else}
          <p class="font-body text-body-md leading-7 text-foreground-alt">
            {m.guide_embed_height_fill_hint()}
          </p>
        {/if}
      </div>

      <div class="mt-12 mb-4 flex flex-wrap items-center justify-center gap-4">
        <Button onclick={showPreview} disabled={!published || !normalisedUrl}>
          {m.guide_embed_preview_action()}
        </Button>
        {#if !published}
          <span class="font-body text-label-md text-foreground-alt">
            {m.guide_embed_preview_publish_first()}
          </span>
        {/if}
      </div>
    </div>

    {#if previewUrl}
      <div
        class="mt-6 w-full max-w-[80rem] border border-border-card bg-background p-3 lg:w-[calc(100%+14rem)]"
      >
        <iframe
          class="block w-full border-0 bg-background-alt"
          style:height={previewHeight}
          src={previewUrl}
          title={mapTitle.trim() || m.guide_embed_map_title_default()}
          allow="fullscreen"
          allowfullscreen
          onload={markPreviewLoaded}
          onerror={() => {
            clearPreviewTimer()
            previewState = 'error'
          }}
        ></iframe>
      </div>
      <p
        class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
        aria-live="polite"
      >
        {previewState === 'loaded'
          ? m.guide_embed_preview_loaded()
          : previewState === 'timeout'
            ? m.guide_embed_preview_timeout()
            : previewState === 'error'
              ? m.guide_embed_preview_error()
              : m.guide_embed_preview_loading()}
      </p>
    {/if}
    <div class="mt-10 max-w-5xl">
      <GuideParagraph>{m.guide_embed_code_description()}</GuideParagraph>
      <div class="mt-5">
        <GuideCodeBlock
          label={m.guide_embed_code_label({ platform: platformLabel })}
          code={iframeCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    </div>
  </section>

  <section class="mt-10" aria-labelledby="embed-placement-title">
    <GuideSubSectionHeader
      id="embed-placement-title"
      requirement={placementRequirement}
      title={m.guide_embed_placement_title({ platform: platformLabel })}
    />
    <GuideParagraph class="mt-3">
      {platform === 'wordpress'
        ? m.guide_embed_placement_wordpress()
        : platform === 'squarespace'
          ? m.guide_embed_placement_squarespace()
          : platform === 'wix'
            ? m.guide_embed_placement_wix()
            : platform === 'webflow'
              ? m.guide_embed_placement_webflow()
              : m.guide_embed_placement_other()}
    </GuideParagraph>
    <div class="mt-5 max-w-[58rem] border border-border-card bg-background p-5">
      <p
        class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
      >
        {m.guide_embed_flow_label({ platform: platformLabel })}
      </p>
      <ol
        class="mt-4 flex flex-wrap justify-center gap-3 font-body text-body-md font-semibold text-primary"
      >
        {#each placementSteps as step, index}
          <li
            class="flex w-full min-w-0 flex-col items-center justify-center gap-3 border border-border-card bg-background-alt p-4 text-center sm:w-[min(100%,13.5rem)]"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-full bg-secondary-container text-secondary"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <section
    class="mt-10 grid gap-5 md:grid-cols-2"
    aria-label={m.guide_embed_troubleshooting_title()}
  >
    <GuideInstructionCallout
      label={m.guide_embed_map_host_label()}
      title={m.guide_embed_map_host_title()}
      description={hosting === 'cloudflare'
        ? m.guide_embed_host_cloudflare_help()
        : hosting === 'github-pages'
          ? m.guide_embed_host_github_help()
          : hosting === 'vercel'
            ? m.guide_embed_host_vercel_help()
            : hosting === 'netlify'
              ? m.guide_embed_host_netlify_help()
              : m.guide_embed_host_other_help()}
    />
    <GuideInstructionCallout
      label={m.guide_embed_site_builder_label()}
      title={m.guide_embed_site_builder_title({ platform: platformLabel })}
      description={siteBuilderHelp}
    />
  </section>

  <section class="mt-10 max-w-[58rem]" aria-labelledby="embed-limits-title">
    <h3
      id="embed-limits-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_embed_limits_title()}
    </h3>
    <ul
      class="mt-4 list-disc space-y-3 pl-6 font-body text-body-lg leading-8 text-foreground-alt"
    >
      <li>{m.guide_embed_limit_responsive()}</li>
      <li>{m.guide_embed_limit_performance()}</li>
      <li>{m.guide_embed_limit_privacy()}</li>
    </ul>
  </section>
</GuideSection>
