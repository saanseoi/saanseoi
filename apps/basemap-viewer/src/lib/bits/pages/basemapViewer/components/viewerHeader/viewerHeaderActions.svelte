<script lang="ts">
import { Popover } from 'bits-ui'
import type { Readable } from 'svelte/store'
import { Icon } from '../../../../primitives/icon'
import { IconButton } from '../../../../primitives/iconButton'
import { SelectMenu } from '../../../../primitives/selectMenu'
import type { Callbacks, ViewerUiState } from '../../../../../ctx/app'
import type { AppState, Locale, Theme } from '../../../../../types'
import {
  featureTextKey,
  features,
  labelTextKey,
  labels,
  locales,
  themes,
  type ViewerText,
} from '../../i18n'
import LayerGroup, { type LayerGroupItem } from './viewerHeaderLayerGroup.svelte'

let {
  callbacks,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
  text: ViewerText
} = $props()

const themeLabel = (theme: Theme) => text[theme]
const localeLabel = (locale: Locale) =>
  locales.find(candidate => candidate.value === locale)?.label ?? locales[0].label
const layerButtonClass =
  'flex h-[28px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-2 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const featureItems = $derived<readonly LayerGroupItem[]>(
  features.map(key => ({
    checked: $viewerState.features[key],
    disabled: !$ui.enabled,
    key,
    label: text[featureTextKey[key]],
  })),
)
const labelItems = $derived<readonly LayerGroupItem[]>(
  labels.map(key => ({
    checked: $viewerState.labels[key],
    disabled:
      !$ui.enabled ||
      (key === 'roads' && !$viewerState.features.roads) ||
      (key === 'pois' && !$viewerState.features.pois),
    key,
    label: text[labelTextKey[key]],
  })),
)
</script>

<div
  class="order-2 ml-auto flex shrink-0 items-center gap-2 self-center max-[700px]:gap-[5px]"
>
  <Popover.Root>
    <Popover.Trigger
      aria-label={text.mapLayers}
      class={layerButtonClass}
      disabled={!$ui.enabled}
    >
      <Icon class="size-4 shrink-0" name="layers" />
      <span
        class="font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.02em]"
      >
        {text.layersButton}
      </span>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="end"
        class="z-20 w-[184px] overflow-hidden rounded-[7px] border border-(--bar-border) bg-(--bar-control-background) p-[9px] shadow-[0_8px_24px_var(--bar-shadow)]"
        data-bar-theme={$viewerState.theme}
        sideOffset={8}
      >
        <LayerGroup
          items={featureItems}
          label={text.features}
          onChange={(key, enabled) =>
            callbacks.onFeature(key as keyof AppState['features'], enabled)}
        />
        <LayerGroup
          items={labelItems}
          label={text.labels}
          onChange={(key, enabled) =>
            callbacks.onLabel(key as keyof AppState['labels'], enabled)}
          separated
        />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>

  <IconButton
    buttonText={text.identify}
    active={$ui.diagnostics.inspect}
    disabled={!$ui.enabled}
    icon="identify"
    label={text.inspect}
    onclick={() => callbacks.onInspect(!$ui.diagnostics.inspect)}
    theme={$viewerState.theme}
  />
  <IconButton
    buttonText={text.diagnostics}
    active={$ui.diagnostics.open}
    disabled={!$ui.enabled}
    icon="debug"
    label={text.diagnostics}
    onclick={() => callbacks.onDiagnostics(!$ui.diagnostics.open)}
    theme={$viewerState.theme}
  />

  <span aria-hidden="true" class="h-5 w-px bg-(--bar-divider)"></span>

  <SelectMenu
    ariaLabel={`${text.mapTheme}: ${themeLabel($viewerState.theme)}`}
    align="end"
    disabled={!$ui.enabled}
    icon="color-palette"
    items={themes.map((theme) => ({ value: theme, label: themeLabel(theme) }))}
    onValueChange={(value) => callbacks.onTheme(value as Theme)}
    placeholder={text.mapTheme}
    theme={$viewerState.theme}
    value={$viewerState.theme}
  />
  <SelectMenu
    ariaLabel={`${text.mapLabelLanguage}: ${localeLabel($viewerState.locale)}`}
    align="end"
    disabled={!$ui.enabled}
    icon="language"
    items={[...locales]}
    onValueChange={(value) => callbacks.onLocale(value as Locale)}
    placeholder={text.mapLabelLanguage}
    theme={$viewerState.theme}
    value={$viewerState.locale}
  />
</div>
