<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

import GuideChoiceGroup from '../../components/shared/guideChoiceGroup.svelte'
import type { GuideChoice } from '../../components/shared/guide.types'

type Props = {
  hosting?: CreateAMapSelectionQuery['hosting']
  hostingChoices: GuideChoice[]
  mobilePlatform?: CreateAMapSelectionQuery['mobilePlatform']
  mobilePlatformChoices: GuideChoice[]
  notebookLibrary?: CreateAMapSelectionQuery['notebookLibrary']
  notebookLibraryChoices: GuideChoice[]
  notebookRuntime?: CreateAMapSelectionQuery['notebookRuntime']
  notebookRuntimeChoices: GuideChoice[]
  objective?: CreateAMapSelectionQuery['objective']
  onWebsitePlatformChange?: (value: string) => void
  prerequisiteMarker: (id: string) => {
    current: number
    label: string
    total: number
  }
  websitePlatform?: CreateAMapSelectionQuery['websitePlatform']
  websitePlatformChoices: GuideChoice[]
}

let {
  hosting = $bindable(),
  hostingChoices,
  mobilePlatform = $bindable(),
  mobilePlatformChoices,
  notebookLibrary = $bindable(),
  notebookLibraryChoices,
  notebookRuntime = $bindable(),
  notebookRuntimeChoices,
  objective,
  onWebsitePlatformChange,
  prerequisiteMarker,
  websitePlatform = $bindable(),
  websitePlatformChoices,
}: Props = $props()
</script>

{#if objective === 'local'}
  <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    {@html m.guide_platform_local_description()}
  </p>
{:else if objective === 'web'}
  <div class="mt-5">
    <GuideChoiceGroup
      alignment="left"
      label={m.guide_host_label()}
      marker={prerequisiteMarker('hosting')}
      hint={m.guide_host_hint()}
      choices={hostingChoices}
      bind:value={hosting}
      variant="tiles"
      tileLayout="flow"
    />
  </div>
{:else if objective === 'web-embed'}
  <div class="mt-5 space-y-6">
    <GuideChoiceGroup
      alignment="left"
      label={m.guide_embed_label()}
      marker={prerequisiteMarker('website-platform')}
      hint={m.guide_embed_hint()}
      choices={websitePlatformChoices}
      bind:value={websitePlatform}
      onchange={onWebsitePlatformChange}
      variant="tiles"
      tileLayout="flow"
    />
    {#if websitePlatform === 'other'}
      <p
        class="border-l-4 border-secondary bg-background p-5 font-body text-body-md leading-7 text-foreground-alt"
      >
        {@html m.guide_embed_other_notice()}
        <a
          class="font-semibold text-secondary underline underline-offset-4"
          href="/#community"
          >{@html m.guide_join_community()}</a
        >.
      </p>
    {:else if websitePlatform}
      <GuideChoiceGroup
        alignment="left"
        label={m.guide_host_label()}
        marker={prerequisiteMarker('hosting')}
        hint={m.guide_embed_host_hint()}
        choices={hostingChoices}
        bind:value={hosting}
        variant="tiles"
        tileLayout="flow"
      />
    {/if}
  </div>
{:else if objective === 'mobile-embed'}
  <div class="mt-5 space-y-5">
    <p class="font-body text-body-md leading-7 text-foreground-alt">
      {@html m.guide_mobile_integration_note()}
    </p>
    <GuideChoiceGroup
      alignment="left"
      label={m.guide_mobile_platform_label()}
      marker={prerequisiteMarker('mobile-platform')}
      choices={mobilePlatformChoices}
      bind:value={mobilePlatform}
      variant="tiles"
      tileLayout="flow"
    />
  </div>
{:else if objective === 'notebook-embed'}
  <div class="mt-5 space-y-5">
    <GuideChoiceGroup
      alignment="left"
      label={m.guide_notebook_library_label()}
      marker={prerequisiteMarker('notebook-library')}
      choices={notebookLibraryChoices}
      bind:value={notebookLibrary}
      variant="tiles"
      tileLayout="flow"
    />
    {#if notebookLibrary}
      <GuideChoiceGroup
        alignment="left"
        label={m.guide_notebook_runtime_label()}
        marker={prerequisiteMarker('notebook-runtime')}
        choices={notebookRuntimeChoices}
        bind:value={notebookRuntime}
        variant="tiles"
        tileLayout="flow"
      />
    {/if}
    {#if notebookLibrary === 'maplibre-jupyter'}
      <p class="font-body text-body-md leading-7 text-foreground-alt">
        {@html m.guide_notebook_maplibre_note()}
      </p>
    {:else if notebookLibrary === 'folium'}
      <p class="font-body text-body-md leading-7 text-foreground-alt">
        {@html m.guide_notebook_folium_note()}
      </p>
    {/if}
  </div>
{/if}
