<script lang="ts">
import { Tooltip } from 'bits-ui'
import { Icon, type IconName } from '../icon'

let {
  icon,
  label,
  theme,
  disabled = false,
  active,
  buttonText,
  ghost = false,
  onclick,
}: {
  icon: IconName
  label: string
  theme: string
  disabled?: boolean
  active?: boolean
  buttonText?: string
  ghost?: boolean
  onclick: () => void
} = $props()

const buttonClass =
  'inline-grid size-[28px] shrink-0 place-items-center rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) p-0 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const labelledButtonClass =
  'flex h-[28px] shrink-0 items-center gap-1.5 rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-2 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const ghostButtonClass =
  'inline-grid size-[28px] shrink-0 place-items-center rounded-[5px] border border-transparent bg-transparent p-0 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
</script>

<Tooltip.Root>
  <Tooltip.Trigger
    aria-label={label}
    aria-pressed={active}
    class={`${buttonText ? labelledButtonClass : ghost ? ghostButtonClass : buttonClass} ${active ? 'border-(--bar-hover-border) bg-(--bar-hover-background)' : ''}`}
    {disabled}
    {onclick}
    type="button"
  >
    <Icon class="size-4 shrink-0" name={icon} />
    {#if buttonText}
      <span
        class="font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.02em]"
      >
        {buttonText}
      </span>
    {/if}
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      class="z-30 rounded-[4px] bg-(--bar-control-background) px-[7px] py-[5px] text-[12px] text-(--bar-text) shadow-[0_3px_12px_var(--bar-shadow)]"
      data-bar-theme={theme}
      sideOffset={6}
      >{label}</Tooltip.Content
    >
  </Tooltip.Portal>
</Tooltip.Root>
