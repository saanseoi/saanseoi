<script lang="ts">
import leaderLineUrl from 'leader-line/leader-line.min.js?url'
import { onMount, tick } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import GuideTextHeader from '../../components/shared/guideTextHeader.svelte'

type LeaderLine = {
  position: () => void
  remove: () => void
}
type LeaderLineConstructor = {
  new (options: Record<string, unknown>): LeaderLine
}
type LeaderLineWindow = Window &
  typeof globalThis & { LeaderLine?: LeaderLineConstructor }
type Props = { promptIcon?: string }

let { promptIcon = 'material-symbols-light:auto-awesome' }: Props = $props()
let explainerElement = $state<HTMLDivElement>()
let leaderLineLoader: Promise<LeaderLineConstructor> | undefined
const mobileCalloutNumberClass =
  'mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden'
const mobileCardNumberClass =
  'pointer-events-none absolute -top-2 -right-2 hidden size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary max-xl:inline-flex'
const mobileCardContentNumberClass =
  'pointer-events-none absolute top-2 right-2 hidden size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary max-xl:inline-flex'

const loadLeaderLine = () => {
  const leaderLineWindow = window as LeaderLineWindow
  if (leaderLineWindow.LeaderLine) return Promise.resolve(leaderLineWindow.LeaderLine)
  if (leaderLineLoader) return leaderLineLoader

  leaderLineLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-leader-line]',
    )
    if (existing) {
      existing.addEventListener('load', () => {
        if (leaderLineWindow.LeaderLine) resolve(leaderLineWindow.LeaderLine)
        else reject(new Error('LeaderLine did not initialise.'))
      })
      existing.addEventListener('error', () =>
        reject(new Error('LeaderLine failed to load.')),
      )
      return
    }

    const script = document.createElement('script')
    script.dataset.leaderLine = 'true'
    script.src = leaderLineUrl
    script.onload = () => {
      if (leaderLineWindow.LeaderLine) resolve(leaderLineWindow.LeaderLine)
      else reject(new Error('LeaderLine did not initialise.'))
    }
    script.onerror = () => reject(new Error('LeaderLine failed to load.'))
    document.head.appendChild(script)
  })
  return leaderLineLoader
}

const socketGravity: Record<string, [number, number]> = {
  bottom: [0, 24],
  top: [0, -24],
}

const lineOptions = (
  startSocket: string,
  endSocket: string,
  path: 'arc' | 'fluid' | 'straight' = 'fluid',
  gravity?: { end?: [number, number]; start?: [number, number] },
) => ({
  color: '#65d8ba',
  endPlug: 'arrow3',
  endPlugSize: 1.4,
  endSocket,
  endSocketGravity: gravity?.end ?? socketGravity[endSocket],
  outline: true,
  outlineColor: '#0c1111',
  outlineSize: 0.7,
  path,
  size: 2,
  startPlug: 'behind',
  startSocket,
  startSocketGravity: gravity?.start ?? socketGravity[startSocket],
})

onMount(() => {
  let lines: LeaderLine[] = []
  let observer: ResizeObserver | undefined
  let disposed = false
  let removeScrollListener: (() => void) | undefined
  let lineSetupStarted = false
  const desktopMediaQuery = window.matchMedia('(min-width: 1280px)')

  const removeLines = () => {
    removeScrollListener?.()
    removeScrollListener = undefined
    observer?.disconnect()
    observer = undefined
    lines.forEach(line => {
      line.remove()
    })
    lines = []
    lineSetupStarted = false
  }

  const connectLines = () => {
    if (!desktopMediaQuery.matches || lineSetupStarted) return
    lineSetupStarted = true

    void tick()
      .then(() => document.fonts.ready)
      .then(loadLeaderLine)
      .then(LeaderLine => {
        if (
          disposed ||
          !desktopMediaQuery.matches ||
          lines.length > 0 ||
          !explainerElement
        ) {
          lineSetupStarted = false
          return
        }
        const explainer = explainerElement

        const connections = [
          ['prompt-icon', '[data-guide-llm-prompt-icon]', 'above'],
          ['prompt-summary', '[data-guide-llm-prompt-summary]', 'above'],
          ['prompt-code', '[data-guide-llm-prompt-code]', 'above'],
          ['prompt-preview', '[data-guide-llm-prompt-preview]', 'above'],
          ['prompt-copy', '[data-guide-llm-prompt-copy]', 'above'],
          ['prompt-content', '[data-guide-llm-prompt-content]', 'short-below'],
          ['code-index', '[data-guide-llm-code-index]', 'above'],
          ['code-type', '[data-guide-llm-code-type]', 'above'],
          ['code-title', '[data-guide-llm-code-title]', 'above'],
          ['code-navigation', '[data-guide-llm-code-navigation]', 'above'],
          ['code-prompt', '[data-guide-llm-code-prompt]', 'above'],
          ['code-copy', '[data-guide-llm-code-copy]', 'side-right'],
          ['code-path', '[data-guide-llm-code-path]', 'below'],
          ['code-content', '[data-guide-llm-code-content]', 'short-below'],
          ['preview-code', '[data-guide-llm-preview-code]', 'above'],
          ['preview-prompt', '[data-guide-llm-preview-prompt]', 'above'],
          ['preview-expand', '[data-guide-llm-preview-expand]', 'above'],
          ['preview-content', '[data-guide-llm-preview-content]', 'short-below'],
        ] as const
        const targets = connections.map(([calloutName, selector, position]) => {
          const callout = explainer.querySelector<HTMLParagraphElement>(
            `[data-guide-llm-callout="${calloutName}"]`,
          )
          const target = explainer.querySelector<HTMLElement>(selector)
          return { callout, position, target }
        })

        const resolvedTargets = targets.filter(
          (
            target,
          ): target is {
            callout: HTMLParagraphElement
            position: 'above' | 'below' | 'short-below' | 'side-right'
            target: HTMLElement
          } => target.callout !== null && target.target !== null,
        )

        if (resolvedTargets.length !== targets.length) {
          lineSetupStarted = false
          return
        }

        lines = resolvedTargets.map(({ callout, position, target }) => {
          return new LeaderLine({
            start: callout,
            end: target,
            ...lineOptions(
              position === 'side-right'
                ? 'left'
                : position === 'above'
                  ? 'bottom'
                  : 'top',
              position === 'side-right'
                ? 'right'
                : position === 'above'
                  ? 'top'
                  : 'bottom',
              position === 'short-below' || position === 'side-right'
                ? 'straight'
                : 'fluid',
            ),
          })
        })

        const position = () => {
          lines.forEach(line => {
            line.position()
          })
        }
        observer = new ResizeObserver(position)
        observer.observe(explainer)
        resolvedTargets.forEach(({ callout, target }) => {
          observer?.observe(callout)
          observer?.observe(target)
        })
        window.addEventListener('scroll', position, true)
        removeScrollListener = () =>
          window.removeEventListener('scroll', position, true)
      })
  }

  const updateLines = () => {
    if (desktopMediaQuery.matches) connectLines()
    else removeLines()
  }

  desktopMediaQuery.addEventListener('change', updateLines)
  updateLines()

  return () => {
    disposed = true
    desktopMediaQuery.removeEventListener('change', updateLines)
    removeLines()
  }
})
</script>

<section
  data-guide-llm-prompt-card-explainer
  class="mt-10 border-t border-border-card pt-8"
  aria-label={m.guide_llm_prompt_card_explainer_title()}
>
  <GuideTextHeader
    as="h3"
    class="text-headline-sm"
    title={m.guide_llm_prompt_card_explainer_title()}
  />
  <p class="mt-3 max-w-232 font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_llm_prompt_card_explainer_description()}
  </p>
  <div bind:this={explainerElement} class="mt-6 space-y-12 xl:-mr-56">
    <div
      class="grid gap-x-5 gap-y-8 py-8 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
    >
      <div
        class="order-1 min-w-0 border border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#211d32] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span
            class="flex min-w-0 items-center gap-3 xl:truncate font-body text-label-sm font-semibold text-[#eeeaff]"
          >
            <span
              data-guide-llm-prompt-icon
              class="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full [background:color-mix(in_srgb,var(--color-secondary)_18%,#211d32)] text-secondary"
            >
              <Icon icon={promptIcon} class="size-4" aria-hidden="true" />
              <span class={mobileCardNumberClass} aria-hidden="true">1</span>
            </span>
            <span data-guide-llm-prompt-summary class="relative"
              >{m.guide_setup_llm_title()}
              <span class={mobileCardNumberClass} aria-hidden="true">2</span></span
            >
          </span>
          <div class="flex shrink-0 items-center gap-4">
            <span
              data-guide-llm-prompt-code
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon
                icon="material-symbols-light:code-rounded"
                class="size-4"
                aria-hidden="true"
              />
              {m.guide_code_block_code()}
              <span class={mobileCardNumberClass} aria-hidden="true">3</span>
            </span>
            <span
              data-guide-llm-prompt-preview
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon icon="proicons:map" class="size-4" aria-hidden="true" />
              {m.guide_code_block_preview()}
              <span class={mobileCardNumberClass} aria-hidden="true">4</span>
            </span>
            <span
              data-guide-llm-prompt-copy
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon icon="ion:copy-outline" class="size-4" aria-hidden="true" />
              {m.common_copy()}
              <span class={mobileCardNumberClass} aria-hidden="true">5</span>
            </span>
          </div>
        </div>
        <div
          data-guide-llm-prompt-content
          class="relative h-16 overflow-hidden border-t border-[color-mix(in_srgb,var(--color-secondary)_45%,#5a4a85)] bg-[#171521] px-4 py-3 mask-[linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <p class="max-w-md font-mono text-body-sm leading-6 text-[#eeeaff]/75">
            {m.guide_llm_prompt_card_explainer_prompt_sample()}
          </p>
          <span class={mobileCardContentNumberClass} aria-hidden="true">6</span>
        </div>
      </div>
      <span
        class="hidden font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_prompt_view()}</span
      >
      <p
        data-guide-llm-callout="prompt-content"
        class="order-7 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">6</span>
        {@html m.guide_llm_prompt_card_explainer_prompt()}
      </p>
      <p
        data-guide-llm-callout="prompt-icon"
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-1 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">1</span>
        {@html m.guide_llm_prompt_card_explainer_prompt_icon()}
      </p>
      <p
        data-guide-llm-callout="prompt-summary"
        class="order-3 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-4 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">2</span>
        {@html m.guide_llm_prompt_card_explainer_prompt_summary()}
      </p>
      <p
        data-guide-llm-callout="prompt-code"
        class="order-4 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-6 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">3</span>
        {@html m.guide_llm_prompt_card_explainer_prompt_code()}
      </p>
      <p
        data-guide-llm-callout="prompt-preview"
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-8 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">4</span>
        {@html m.guide_llm_prompt_card_explainer_prompt_preview()}
      </p>
      <p
        data-guide-llm-callout="prompt-copy"
        class="order-6 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-10 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">5</span>
        {@html m.guide_llm_prompt_card_explainer_prompt_copy()}
      </p>
    </div>

    <div
      class="grid gap-x-5 gap-y-8 py-8 xl:-mt-8 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
    >
      <div
        class="order-1 min-w-0 border border-[#596074] bg-[#202633] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0 xl:self-start"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span
            class="flex min-w-0 items-center gap-2 xl:truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
          >
            <span data-guide-llm-code-index class="relative text-secondary"
              >01<span class={mobileCardNumberClass} aria-hidden="true">1</span></span
            ><span data-guide-llm-code-type class="relative"
              >CLI<span class={mobileCardNumberClass} aria-hidden="true">2</span></span
            ><span aria-hidden="true">•</span
            ><span data-guide-llm-code-title class="relative xl:truncate"
              >{m.guide_llm_prompt_card_explainer_code_title()}
              <span class={mobileCardNumberClass} aria-hidden="true">3</span></span
            >
          </span>
          <span class="flex shrink-0 items-center gap-4 text-white/75">
            <span
              data-guide-llm-code-navigation
              class="relative inline-flex items-center"
              ><Icon icon="proicons:chevron-left" class="size-4" aria-hidden="true" />
              <Icon icon="proicons:chevron-right" class="size-4" aria-hidden="true" />
              <span class={mobileCardNumberClass} aria-hidden="true">4</span></span
            >
            <span
              data-guide-llm-code-prompt
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:auto-awesome"
                class="size-4"
                aria-hidden="true"
              /><span class={mobileCardNumberClass} aria-hidden="true">5</span>
              {m.guide_llm_prompt_card_prompt()}</span
            >
            <span
              data-guide-llm-code-copy
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon icon="ion:copy-outline" class="size-4" aria-hidden="true" />
              {m.common_copy()}
              <span class={mobileCardNumberClass} aria-hidden="true">6</span></span
            >
          </span>
        </div>
        <div
          class="border-t border-[#596074] bg-[#182021] px-4 py-1.5 font-mono text-label-sm text-[#d6e4ff]/75"
        >
          <span data-guide-llm-code-path class="relative"
            ><span class="mr-2 text-white/50">{m.guide_llm_prompt_card_path()}</span
            ><span>~/saanseoi-project</span
            ><span class={mobileCardNumberClass} aria-hidden="true">7</span></span
          >
        </div>
        <div
          data-guide-llm-code-content
          class="relative h-16 overflow-hidden bg-[#131722] px-4 py-3 mask-[linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <p class="font-mono text-sm leading-6 text-[#d6e4ff]/75">
            <span class="mr-2 text-secondary">$</span>bun create vite . --template
            vanilla-ts
          </p>
          <span class={mobileCardContentNumberClass} aria-hidden="true">8</span>
        </div>
      </div>
      <span
        class="hidden max-w-24 font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:-translate-y-8 xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_code_view()}</span
      >
      <p
        data-guide-llm-callout="code-index"
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-span-2 xl:row-start-1 xl:order-0 xl:w-3/4 xl:translate-y-12 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">1</span>
        {@html m.guide_llm_prompt_card_explainer_code_index()}
      </p>
      <p
        data-guide-llm-callout="code-type"
        class="order-3 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">2</span>
        {@html m.guide_llm_prompt_card_explainer_code_type()}
      </p>
      <p
        data-guide-llm-callout="code-title"
        class="order-4 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">3</span>
        {@html m.guide_llm_prompt_card_explainer_code_title_description()}
      </p>
      <p
        data-guide-llm-callout="code-navigation"
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-7 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">4</span>
        {@html m.guide_llm_prompt_card_explainer_code_navigation()}
      </p>
      <p
        data-guide-llm-callout="code-prompt"
        class="order-6 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-9 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">5</span>
        {@html m.guide_llm_prompt_card_explainer_code_prompt()}
      </p>
      <p
        data-guide-llm-callout="code-copy"
        class="order-7 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-11 xl:col-span-2 xl:row-start-2 xl:order-0 xl:w-48 xl:-translate-y-12 xl:translate-x-4 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">6</span>
        {@html m.guide_llm_prompt_card_explainer_code_copy()}
      </p>
      <p
        data-guide-llm-callout="code-path"
        class="order-8 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-2 xl:row-start-3 xl:order-0 xl:-translate-y-12 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">7</span>
        {@html m.guide_llm_prompt_card_explainer_code_path_description()}
      </p>
      <p
        data-guide-llm-callout="code-content"
        class="order-9 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:w-[120%] xl:row-start-3 xl:order-0 xl:-translate-y-12 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">8</span>
        {@html m.guide_llm_prompt_card_explainer_code_reference()}
      </p>
    </div>

    <div
      class="grid gap-x-5 gap-y-8 py-8 xl:-mt-16 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
    >
      <div
        class="order-1 min-w-0 border border-[#596074] bg-[#202633] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span class="truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
            >{m.guide_llm_prompt_card_explainer_preview_title()}</span
          >
          <span class="flex shrink-0 items-center gap-4 text-white/75">
            <span
              data-guide-llm-preview-code
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:code-rounded"
                class="size-4"
                aria-hidden="true"
              />{m.guide_code_block_code()}
              <span class={mobileCardNumberClass} aria-hidden="true">1</span></span
            >
            <span
              data-guide-llm-preview-prompt
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:auto-awesome"
                class="size-4"
                aria-hidden="true"
              />{m.guide_llm_prompt_card_prompt()}
              <span class={mobileCardNumberClass} aria-hidden="true">2</span></span
            >
            <span
              data-guide-llm-preview-expand
              class="relative inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon icon="ion:expand-outline" class="size-4" aria-hidden="true" />
              {m.guide_code_block_expand()}
              <span class={mobileCardNumberClass} aria-hidden="true">3</span></span
            >
          </span>
        </div>
        <div
          data-guide-llm-preview-content
          class="relative h-16 overflow-hidden border-t border-[#596074] bg-[#131722] p-3 mask-[linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <div
            class="h-20 w-44 border border-[#6b7c96]/45 bg-[linear-gradient(135deg,#5c6f93_0_24%,#8ba9b7_24%_42%,#e4c890_42%_57%,#597e78_57%)] opacity-70"
          ></div>
          <span class={mobileCardContentNumberClass} aria-hidden="true">4</span>
        </div>
      </div>
      <span
        class="hidden font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_preview_view()}</span
      >
      <p
        data-guide-llm-callout="preview-content"
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">4</span>
        {@html m.guide_llm_prompt_card_explainer_preview()}
      </p>
      <p
        data-guide-llm-callout="preview-expand"
        class="order-4 min-w-0 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-9 xl:col-span-1 xl:row-start-1 xl:order-0 xl:-translate-y-4 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">3</span>
        {@html m.guide_llm_prompt_card_explainer_preview_expand()}
      </p>
      <p
        data-guide-llm-callout="preview-code"
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-6 xl:col-span-2 xl:row-start-1 xl:order-0 xl:-translate-y-4 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">1</span>
        {@html m.guide_llm_prompt_card_explainer_preview_code()}
      </p>
      <p
        data-guide-llm-callout="preview-prompt"
        class="order-3 min-w-0 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-8 xl:col-span-1 xl:row-start-1 xl:order-0 xl:-translate-y-4 xl:self-start xl:border-l-0 xl:pl-0"
      >
        <span class={mobileCalloutNumberClass} aria-hidden="true">2</span>
        {@html m.guide_llm_prompt_card_explainer_preview_prompt()}
      </p>
    </div>
  </div>
</section>
