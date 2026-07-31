<script lang="ts">
import { Select, Tooltip } from 'bits-ui'
import { Icon, type IconName } from '../icon'

export interface SelectMenuOption {
  value: string
  label: string
}

let {
  items,
  value,
  placeholder,
  ariaLabel,
  ariaLabelledby,
  buttonLabel,
  label,
  theme,
  icon,
  tooltip,
  disabled = false,
  align = 'start',
  triggerClass = '',
  optionClass = '',
  onValueChange,
}: {
  items: SelectMenuOption[]
  value: string
  placeholder: string
  ariaLabel?: string
  ariaLabelledby?: string
  buttonLabel?: string
  label?: string
  theme: string
  icon?: IconName
  tooltip?: string
  disabled?: boolean
  align?: 'start' | 'end'
  triggerClass?: string
  optionClass?: string
  onValueChange: (value: string) => void
} = $props()

const textTriggerClass =
  'flex h-[28px] items-center justify-between gap-3 rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-[7px] py-0 text-left text-[12px] leading-[1.2] font-[550] text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const iconTriggerClass =
  'inline-grid size-[28px] place-items-center rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) p-0 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const labelledIconTriggerClass =
  'flex h-[28px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-2 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const contentClass =
  'z-20 min-w-[156px] overflow-hidden rounded-[7px] border border-(--bar-border) bg-(--bar-control-background) shadow-[0_8px_24px_var(--bar-shadow)]'
const triggerLabelClass =
  'shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.02em] text-(--bar-muted)'
const itemClass =
  'flex cursor-default items-center justify-between gap-[18px] px-2.5 py-2 text-[13px] text-(--bar-text) outline-none data-highlighted:bg-(--bar-hover-background)'
</script>

<Select.Root {disabled} {items} {onValueChange} type="single" {value}>
  {#if icon && tooltip && !buttonLabel}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Select.Trigger
            {...props}
            aria-label={ariaLabel}
            class={`${iconTriggerClass} ${triggerClass}`}
          >
            <Icon class="size-4 shrink-0" name={icon} />
          </Select.Trigger>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          class="z-30 rounded-[4px] bg-(--bar-control-background) px-[7px] py-[5px] text-[12px] text-(--bar-text) shadow-[0_3px_12px_var(--bar-shadow)]"
          data-bar-theme={theme}
          sideOffset={6}
          >{tooltip}</Tooltip.Content
        >
      </Tooltip.Portal>
    </Tooltip.Root>
  {:else if icon}
    <Select.Trigger
      aria-label={ariaLabel}
      class={`${buttonLabel ? labelledIconTriggerClass : iconTriggerClass} ${triggerClass}`}
    >
      <Icon class="size-4 shrink-0" name={icon} />
      {#if buttonLabel}
        <span
          class="font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.02em]"
        >
          {buttonLabel}
        </span>
      {/if}
    </Select.Trigger>
  {:else}
    <Select.Trigger
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      class={`${textTriggerClass} ${triggerClass}`}
    >
      <span class="flex min-w-0 flex-1 items-center gap-3">
        {#if label}
          <span class={triggerLabelClass}>{label}</span>
        {/if}
        <span class="min-w-0 flex-1 truncate"><Select.Value {placeholder} /></span>
      </span>
      <Icon class="size-4 shrink-0 self-center" name="chevron-down" />
    </Select.Trigger>
  {/if}
  <Select.Portal>
    <Select.Content {align} class={contentClass} data-bar-theme={theme} sideOffset={6}>
      <Select.Viewport>
        {#each items as item}
          <Select.Item
            class={`${itemClass} ${optionClass}`}
            label={item.label}
            value={item.value}
          >
            {#snippet children({ selected })}
              <span>{item.label}</span>
              {#if selected}
                <Icon class="size-[15px] text-(--bar-accent)" name="checkmark" />
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
