<script lang="ts">
import Icon from '@iconify/svelte'
import { Select } from 'bits-ui'

import {
  localeOptions,
  m,
  type AppLocale,
  getLocale,
  setLocale,
} from '$lib/bits/internal/i18n'
import { Label } from '$lib/bits/primitives/label'

let currentLocale = $state(getLocale() as AppLocale)

const options = localeOptions.map(option => ({
  value: option.value,
  label: option.label(),
}))
const fallbackOption = options[0] ?? {
  value: () => currentLocale,
  label: m.language_selector_placeholder(),
}
const currentOption = $derived(
  options.find(option => option.value === currentLocale) ?? fallbackOption,
)
const alternateOptions = $derived(
  options.filter(option => option.value !== currentLocale),
)

// biome-ignore lint: incorrect lint/correctness/noUnusedVariables
function handleLocaleChange(nextLocale: string) {
  currentLocale = nextLocale as AppLocale
  void setLocale(currentLocale)
}
</script>

<div class="flex items-center">
  <Label class="sr-only" for="language-selector"> {m.language_selector_label()} </Label>

  <Select.Root
    items={options}
    name="language"
    onValueChange={handleLocaleChange}
    type="single"
    value={currentLocale}
  >
    <Select.Trigger
      class="inline-flex size-11 items-center justify-center rounded-default border border-border-card/70 bg-muted text-foreground transition-colors hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      id="language-selector"
    >
      <Select.Value placeholder={m.language_selector_placeholder()}>
        {#snippet children()}
          <span class="sr-only">{currentOption.label}</span>
          <Icon icon="proicons:globe" class="size-4.5 text-secondary" />
        {/snippet}
      </Select.Value>
    </Select.Trigger>

    <Select.Portal>
      <Select.Content
        class="z-50 min-w-56 overflow-hidden rounded-lg border-2 border-foreground/90 bg-background-alt p-1 text-foreground shadow-popover"
        sideOffset={8}
      >
        <Select.Viewport class="flex flex-col gap-1">
          <div
            class="flex items-center justify-between rounded-default border border-border-card/60 bg-muted px-3 py-2"
          >
            <div class="flex min-w-0 flex-col">
              <span
                class="truncate font-body text-[0.92rem] font-semibold text-foreground"
              >
                {currentOption.label}
              </span>
            </div>
            <Icon icon="proicons:checkmark" class="size-4 shrink-0 text-secondary" />
          </div>

          {#each alternateOptions as option}
            <Select.Item
              class="flex cursor-default items-center justify-between rounded-default px-3 py-2 font-body text-[0.92rem] text-foreground outline-none transition-colors data-highlighted:bg-muted data-highlighted:text-foreground"
              label={option.label}
              value={option.value}
            >
              {#snippet children()}
                <span>{option.label}</span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
</div>
