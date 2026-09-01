<script lang="ts">
import {
  GuideCodeBlock,
  GuideInstructionCallout,
  GuideParagraph,
  GuideSection,
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
  <div class="space-y-5">
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
    <fieldset class="mt-8 max-w-[58rem] border border-border-card bg-background p-5">
      <legend class="px-2 font-display text-title-md font-bold text-primary">
        {m.guide_embed_wordpress_kind_title()}
      </legend>
      <p class="font-body text-body-md leading-7 text-foreground-alt">
        {m.guide_embed_wordpress_kind_description()}
      </p>
      <div class="mt-4 flex flex-wrap gap-5 font-body text-body-md text-foreground-alt">
        <label class="flex items-center gap-2">
          <input bind:group={wordpressKind} type="radio" value="self-hosted">
          {m.guide_embed_wordpress_self_hosted()}
        </label>
        <label class="flex items-center gap-2">
          <input bind:group={wordpressKind} type="radio" value="wordpress-com">
          {m.guide_embed_wordpress_com()}
        </label>
      </div>
      {#if wordpressKind === 'wordpress-com'}
        <p class="mt-4 font-body text-body-md leading-7 text-foreground-alt">
          {m.guide_embed_wordpress_com_limit()}
        </p>
      {/if}
    </fieldset>
  {/if}

  <section class="mt-10" aria-labelledby="embed-preview-title">
    <h3
      id="embed-preview-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_embed_preview_title()}
    </h3>
    <GuideParagraph class="mt-3">
      {m.guide_embed_preview_description()}
    </GuideParagraph>

    <div class="mt-5 grid max-w-[58rem] gap-5 sm:grid-cols-2">
      <label class="sm:col-span-2">
        <span class="font-body text-label-md font-semibold text-primary">
          {m.guide_embed_map_url_label()}
        </span>
        <input
          class="mt-2 w-full border border-border-card bg-background px-4 py-3 font-body text-body-md text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
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
        <span class="font-body text-label-md font-semibold text-primary">
          {m.guide_embed_map_title_label()}
        </span>
        <input
          class="mt-2 w-full border border-border-card bg-background px-4 py-3 font-body text-body-md text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
          type="text"
          placeholder={m.guide_embed_map_title_placeholder()}
          bind:value={mapTitle}
        >
        <span class="mt-2 block font-body text-label-md leading-6 text-foreground-alt">
          {m.guide_embed_map_title_hint()}
        </span>
      </label>

      <fieldset>
        <legend class="font-body text-label-md font-semibold text-primary">
          {m.guide_embed_height_label()}
        </legend>
        <div
          class="mt-3 flex flex-wrap gap-5 font-body text-body-md text-foreground-alt"
        >
          <label class="flex items-center gap-2">
            <input bind:group={heightMode} type="radio" value="fixed">
            {m.guide_embed_height_fixed()}
          </label>
          <label class="flex items-center gap-2">
            <input bind:group={heightMode} type="radio" value="fill">
            {m.guide_embed_height_fill()}
          </label>
        </div>
      </fieldset>

      {#if heightMode === 'fixed'}
        <label>
          <span class="font-body text-label-md font-semibold text-primary">
            {m.guide_embed_height_pixels()}
          </span>
          <input
            class="mt-2 w-full border border-border-card bg-background px-4 py-3 font-body text-body-md text-foreground outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
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

    <div class="mt-5 flex flex-wrap items-center gap-4">
      <Button onclick={showPreview} disabled={!published || !normalisedUrl}>
        {m.guide_embed_preview_action()}
      </Button>
      {#if !published}
        <span class="font-body text-label-md text-foreground-alt">
          {m.guide_embed_preview_publish_first()}
        </span>
      {/if}
    </div>

    {#if previewUrl}
      <div class="mt-6 max-w-5xl border border-border-card bg-background p-3">
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
        <a
          class="ml-1 font-semibold text-secondary underline underline-offset-4"
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          >{m.guide_embed_open_new_tab()}</a
        >
      </p>
    {/if}
  </section>

  <section class="mt-10" aria-labelledby="embed-code-title">
    <h3
      id="embed-code-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_embed_code_title()}
    </h3>
    <GuideParagraph class="mt-3">
      {m.guide_embed_code_description()}
    </GuideParagraph>
    <div class="mt-5 max-w-5xl">
      <GuideCodeBlock
        label={m.guide_embed_code_label({ platform: platformLabel })}
        code={iframeCode}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </div>
  </section>

  <section class="mt-10" aria-labelledby="embed-placement-title">
    <h3
      id="embed-placement-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_embed_placement_title({ platform: platformLabel })}
    </h3>
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
    <div
      class="mt-5 max-w-[58rem] border border-border-card bg-background p-5"
      role="img"
      aria-label={m.guide_embed_illustration_alt({ element: elementName, platform: platformLabel })}
    >
      <p
        class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
      >
        {m.guide_embed_illustration_label()}
      </p>
      <div
        class="mt-4 grid items-center gap-3 text-center font-body text-body-md font-semibold text-primary sm:grid-cols-[1fr_auto_1fr_auto_1fr]"
      >
        <div class="border border-border-card bg-background-alt p-4">
          1. {m.guide_embed_illustration_edit()}
        </div>
        <span aria-hidden="true">→</span>
        <div class="border border-secondary bg-secondary-container p-4">
          2. {elementName}
        </div>
        <span aria-hidden="true">→</span>
        <div class="border border-border-card bg-background-alt p-4">
          3. {m.guide_embed_illustration_publish()}
        </div>
      </div>
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
      description={m.guide_embed_site_builder_help({ element: elementName })}
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
      <li>{m.guide_embed_limit_accessibility()}</li>
      <li>{m.guide_embed_limit_performance()}</li>
      <li>{m.guide_embed_limit_privacy()}</li>
      <li>{m.guide_embed_limit_cross_origin()}</li>
    </ul>
  </section>
</GuideSection>
