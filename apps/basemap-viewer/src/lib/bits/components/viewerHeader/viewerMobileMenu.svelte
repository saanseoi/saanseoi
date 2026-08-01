<script lang="ts">
import { fly, slide } from 'svelte/transition'
import type { Readable } from 'svelte/store'
import { Icon } from '../../primitives/icon'
import { SelectMenu } from '../../primitives/selectMenu'
import DiagnosticTools from '../panels/viewerDiagnostics/viewerDiagnosticsTools.svelte'
import type { Callbacks, ViewerUiState } from '../../../ctx/app'
import type { AppState, Locale, Theme } from '../../../types'
import { locales, themes, type ViewerText } from '../../pages/basemapViewer/i18n'
import {
  asFeatureKey,
  asLabelKey,
  comparisonReleaseOptions,
  layerItems,
  regionLabel,
  regionOptions,
  releaseOptions,
} from '../../pages/basemapViewer/controlOptions'
import ComparisonModes from './viewerHeaderComparisonModes.svelte'
import LayerGroup from './viewerHeaderLayerGroup.svelte'
import UseThisMap from './viewerHeaderUseThisMap.svelte'

let {
  callbacks,
  selectedPanel,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  selectedPanel: 'diagnostics' | 'inspection' | null
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
  text: ViewerText
} = $props()

const layers = $derived(layerItems($viewerState, $ui.enabled, text, 'compact'))

const regionValueLabel = $derived.by(() => {
  const region = $ui.regions.find(region => region.code === $viewerState.regionCode)
  return region ? regionLabel(region, text, true) : text.selectRegion
})
const versionValueLabel = $derived(
  $viewerState.version === 'latest' ? text.latest : $viewerState.version,
)
const comparisonValueLabel = $derived(
  $viewerState.comparisonVersion === null
    ? text.noComparison
    : $viewerState.comparisonVersion === 'latest'
      ? text.latest
      : $viewerState.comparisonVersion,
)

const fieldLabelClass =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-(--bar-muted)'
const sectionLabelClass = 'm-0 text-sm font-bold'
const actionClass =
  'flex h-11 cursor-pointer items-center gap-3 rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-3 text-left font-mono text-[12px] font-semibold text-(--bar-text) transition-colors hover:border-(--bar-hover-border) hover:bg-(--bar-hover-background) aria-pressed:bg-(--bar-active-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) disabled:cursor-not-allowed'
</script>

<aside
  aria-label={text.mapControls}
  in:fly={{ x: -320, duration: 220 }}
  out:fly={{ x: -320, duration: 180 }}
  class="fixed inset-y-0 left-0 z-25 flex w-full flex-col border-r border-(--bar-border) bg-(--panel-background) text-(--bar-text) shadow-[0_8px_24px_var(--bar-shadow)]"
  data-bar-theme={$viewerState.theme}
>
  <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-28">
    <div class="grid gap-6">
      <div class="-mb-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <h2 class="m-0 pt-1 text-sm font-bold">{text.basemapSelection}</h2>
        <div class="flex gap-2">
          <SelectMenu
            ariaLabel={text.mapTheme}
            disabled={!$ui.enabled}
            ghost
            icon="color-palette"
            iconClass="size-5"
            items={themes.map(theme => ({ value: theme, label: text[theme] }))}
            onValueChange={(value) => callbacks.onTheme(value as Theme)}
            placeholder={text.mapTheme}
            theme={$viewerState.theme}
            triggerClass="size-[37px]!"
            value={$viewerState.theme}
          />
          <SelectMenu
            ariaLabel={text.mapLabelLanguage}
            disabled={!$ui.enabled}
            ghost
            icon="language"
            iconClass="size-5"
            items={[...locales]}
            onValueChange={(value) => callbacks.onLocale(value as Locale)}
            placeholder={text.mapLabelLanguage}
            theme={$viewerState.theme}
            triggerClass="size-[37px]!"
            value={$viewerState.locale}
          />
        </div>
        <div class="justify-self-end">
          <UseThisMap ghost {text} theme={$viewerState.theme} />
        </div>
      </div>

      <section class="grid gap-4">
        {#key `${$viewerState.regionCode}-${$ui.versions.join(',')}`}
          <div class="grid gap-1.5">
            <span class={fieldLabelClass}>{text.region}</span>
            <SelectMenu
              ariaLabel={text.region}
              disabled={!$ui.catalogueReady}
              items={regionOptions($ui.regions, text, true)}
              onValueChange={callbacks.onRegion}
              optionClass="font-mono"
              placeholder={text.selectRegion}
              theme={$viewerState.theme}
              triggerClass="h-11! pl-4! w-full font-mono"
              value={$viewerState.regionCode ?? ''}
              valueLabel={regionValueLabel}
              valueLabelClass="left-4!"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-1.5">
              <span class={fieldLabelClass}>{text.version}</span>
              <SelectMenu
                ariaLabel={text.release}
                disabled={!$ui.catalogueReady}
                items={releaseOptions($ui.versions, text)}
                onValueChange={callbacks.onVersion}
                optionClass="font-mono"
                placeholder={text.latest}
                theme={$viewerState.theme}
                triggerClass="h-11! pl-4! w-full font-mono"
                value={$viewerState.version}
                valueLabel={versionValueLabel}
                valueLabelClass="left-4!"
              />
            </div>
            <div class="grid min-w-0 gap-1.5">
              <span class={fieldLabelClass}>{text.comparison}</span>
              <SelectMenu
                ariaLabel={text.compare}
                disabled={!$ui.catalogueReady}
                items={comparisonReleaseOptions($ui.versions, text)}
                onValueChange={(value) => callbacks.onComparisonVersion(value === 'off' ? null : value)}
                optionClass="font-mono"
                placeholder={text.noComparison}
                theme={$viewerState.theme}
                triggerClass="h-11! pl-4! w-full font-mono"
                value={$viewerState.comparisonVersion ?? 'off'}
                valueLabel={comparisonValueLabel}
                valueLabelClass="left-4!"
              />
            </div>
          </div>
        {/key}
      </section>

      {#if $viewerState.comparisonVersion}
        <section
          in:slide={{ duration: 180 }}
          out:slide={{ duration: 150 }}
          class="grid gap-1.5"
        >
          <h3 class={fieldLabelClass}>{text.comparisonMode}</h3>
          <ComparisonModes
            class="h-11! w-full self-stretch"
            mode={$viewerState.comparisonMode}
            {callbacks}
            {text}
          />
        </section>
      {/if}

      <section class="grid gap-3">
        <h3 class={sectionLabelClass}>{text.show}</h3>
        <div class="grid items-start grid-cols-2 gap-2 px-2">
          <LayerGroup
            class="pb-0"
            items={layers.features}
            label={text.features}
            onChange={(key, enabled) => callbacks.onFeature(asFeatureKey(key), enabled)}
          />
          <LayerGroup
            class="pb-0"
            items={layers.labels}
            label={text.labels}
            onChange={(key, enabled) => callbacks.onLabel(asLabelKey(key), enabled)}
          />
        </div>
      </section>

      <section class="grid gap-3">
        <h3 class={sectionLabelClass}>{text.panels}</h3>
        <div
          class="grid grid-cols-2 gap-3 [&>button]:min-w-0 [&>button]:gap-2 [&>button]:px-2"
        >
          <button
            aria-pressed={selectedPanel === 'inspection'}
            class={actionClass}
            disabled={!$ui.enabled}
            onclick={() => callbacks.onInspect(!$ui.diagnostics.inspect)}
            type="button"
          >
            <Icon class="size-5 shrink-0" name="identify" />
            {text.identifyFeatures}
          </button>
          <button
            aria-pressed={selectedPanel === 'diagnostics'}
            class={actionClass}
            disabled={!$ui.enabled}
            onclick={() => callbacks.onDiagnostics(!$ui.diagnostics.open)}
            type="button"
          >
            <Icon class="size-5 shrink-0" name="debug" />
            {text.diagnosticsLabel}
          </button>
        </div>
      </section>

      <section class="grid gap-3">
        <h3 class={sectionLabelClass}>{text.diagnosticsLabel}</h3>
        <DiagnosticTools
          {callbacks}
          debug={$ui.diagnostics.debug}
          mobile
          separated={false}
          showTitle={false}
          {text}
        />
      </section>
    </div>
  </div>
</aside>
