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
  new (
    start: HTMLElement | unknown,
    end: HTMLElement | unknown,
    options: Record<string, unknown>,
  ): LeaderLine
  pointAnchor: (element: HTMLElement, options: { x: number; y: number }) => unknown
}
type LeaderLineWindow = Window &
  typeof globalThis & { LeaderLine?: LeaderLineConstructor }
type Props = { promptIcon?: string }

let { promptIcon = 'material-symbols-light:auto-awesome' }: Props = $props()
let explainerElement = $state<HTMLDivElement>()
let promptIconCallout: HTMLParagraphElement
let promptSummaryCallout: HTMLParagraphElement
let promptContentCallout: HTMLParagraphElement
let promptCodeCallout: HTMLParagraphElement
let promptPreviewCallout: HTMLParagraphElement
let promptCopyCallout: HTMLParagraphElement
let codeIndexCallout: HTMLParagraphElement
let codeTypeCallout: HTMLParagraphElement
let codeTitleCallout: HTMLParagraphElement
let codeNavigationCallout: HTMLParagraphElement
let codePromptCallout: HTMLParagraphElement
let codeCopyCallout: HTMLParagraphElement
let codePathCallout: HTMLParagraphElement
let codeContentCallout: HTMLParagraphElement
let previewCodeCallout: HTMLParagraphElement
let previewPromptCallout: HTMLParagraphElement
let previewContentCallout: HTMLParagraphElement
let previewExpandCallout: HTMLParagraphElement
let leaderLineLoader: Promise<LeaderLineConstructor> | undefined

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
) => ({
  color: '#65d8ba',
  endPlug: 'arrow3',
  endPlugSize: 1.4,
  endSocket,
  endSocketGravity: socketGravity[endSocket],
  outline: true,
  outlineColor: '#0c1111',
  outlineSize: 0.7,
  path,
  size: 2,
  startPlug: 'behind',
  startSocket,
  startSocketGravity: socketGravity[startSocket],
})

const dimensions = (element: HTMLElement) => {
  const { height, width } = element.getBoundingClientRect()
  return { height, width }
}

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

        const connections = [
          [promptIconCallout, '[data-guide-llm-prompt-icon]', 'short-above'],
          [promptSummaryCallout, '[data-guide-llm-prompt-summary]', 'short-above'],
          [promptCodeCallout, '[data-guide-llm-prompt-code]', 'above'],
          [promptPreviewCallout, '[data-guide-llm-prompt-preview]', 'above'],
          [promptCopyCallout, '[data-guide-llm-prompt-copy]', 'above'],
          [promptContentCallout, '[data-guide-llm-prompt-content]', 'short-below'],
          [codeIndexCallout, '[data-guide-llm-code-index]', 'above'],
          [codeTypeCallout, '[data-guide-llm-code-type]', 'above'],
          [codeTitleCallout, '[data-guide-llm-code-title]', 'short-above'],
          [codeNavigationCallout, '[data-guide-llm-code-navigation]', 'short-above'],
          [codePromptCallout, '[data-guide-llm-code-prompt]', 'short-above'],
          [codeCopyCallout, '[data-guide-llm-code-copy]', 'side-right'],
          [codePathCallout, '[data-guide-llm-code-path]', 'below'],
          [codeContentCallout, '[data-guide-llm-code-content]', 'short-below'],
          [previewCodeCallout, '[data-guide-llm-preview-code]', 'above'],
          [previewPromptCallout, '[data-guide-llm-preview-prompt]', 'above'],
          [previewExpandCallout, '[data-guide-llm-preview-expand]', 'above'],
          [previewContentCallout, '[data-guide-llm-preview-content]', 'short-below'],
        ] as const
        const targets = connections.map(([callout, selector, position]) => {
          const target = explainerElement?.querySelector<HTMLElement>(selector)
          return { callout, position, target }
        })

        const resolvedTargets = targets.filter(
          (
            target,
          ): target is {
            callout: HTMLParagraphElement
            position: 'above' | 'below' | 'short-above' | 'short-below' | 'side-right'
            target: HTMLElement
          } => target.target !== null,
        )

        if (resolvedTargets.length !== targets.length) {
          lineSetupStarted = false
          return
        }

        lines = resolvedTargets.map(({ callout, position, target }) => {
          const targetSize = dimensions(target)
          return new LeaderLine(
            callout,
            LeaderLine.pointAnchor(target, {
              x:
                position === 'side-right'
                  ? targetSize.width + 44
                  : position === 'short-below'
                    ? targetSize.width * 0.4
                    : targetSize.width / 2,
              y:
                position === 'side-right'
                  ? targetSize.height / 2
                  : position === 'above' || position === 'short-above'
                    ? 0
                    : position === 'short-below'
                      ? targetSize.height
                      : targetSize.height + 12,
            }),
            lineOptions(
              position === 'side-right'
                ? 'left'
                : position === 'above' || position === 'short-above'
                  ? 'bottom'
                  : 'top',
              position === 'side-right'
                ? 'right'
                : position === 'above' || position === 'short-above'
                  ? 'top'
                  : 'bottom',
              position === 'short-above' || position === 'short-below'
                ? 'straight'
                : 'fluid',
            ),
          )
        })

        const position = () => {
          lines.forEach(line => {
            line.position()
          })
        }
        observer = new ResizeObserver(position)
        observer.observe(explainerElement)
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
        class="order-4 min-w-0 overflow-hidden border border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#211d32] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span
            class="flex min-w-0 items-center gap-3 truncate font-body text-label-sm font-semibold text-[#eeeaff]"
          >
            <span
              data-guide-llm-prompt-icon
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-full [background:color-mix(in_srgb,var(--color-secondary)_18%,#211d32)] text-secondary"
            >
              <Icon icon={promptIcon} class="size-4" aria-hidden="true" />
            </span>
            <span data-guide-llm-prompt-summary>{m.guide_setup_llm_title()}</span>
          </span>
          <div class="flex shrink-0 items-center gap-4">
            <span
              data-guide-llm-prompt-code
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon
                icon="material-symbols-light:code-rounded"
                class="size-4"
                aria-hidden="true"
              />
              {m.guide_code_block_code()}
            </span>
            <span
              data-guide-llm-prompt-preview
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon icon="proicons:map" class="size-4" aria-hidden="true" />
              {m.guide_code_block_preview()}
            </span>
            <span
              data-guide-llm-prompt-copy
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75"
            >
              <Icon icon="ion:copy-outline" class="size-4" aria-hidden="true" />
              {m.common_copy()}
            </span>
          </div>
        </div>
        <div
          data-guide-llm-prompt-content
          class="relative h-16 overflow-hidden border-t border-[color-mix(in_srgb,var(--color-secondary)_45%,#5a4a85)] bg-[#171521] px-4 py-3 [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <p class="max-w-112 font-mono text-body-sm leading-6 text-[#eeeaff]/75">
            {m.guide_llm_prompt_card_explainer_prompt_sample()}
          </p>
        </div>
      </div>
      <span
        class="hidden font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_prompt_view()}</span
      >
      <p
        bind:this={promptContentCallout}
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt()}
      </p>
      <p
        bind:this={promptIconCallout}
        class="order-1 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-1 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt_icon()}
      </p>
      <p
        bind:this={promptSummaryCallout}
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-4 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt_summary()}
      </p>
      <p
        bind:this={promptCodeCallout}
        class="order-3 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-6 xl:col-span-2 xl:row-start-1 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt_code()}
      </p>
      <p
        bind:this={promptPreviewCallout}
        class="order-4 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-8 xl:col-span-2 xl:row-start-1 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt_preview()}
      </p>
      <p
        bind:this={promptCopyCallout}
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-10 xl:col-span-2 xl:row-start-1 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_prompt_copy()}
      </p>
    </div>

    <div
      class="grid gap-x-5 gap-y-8 py-8 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
    >
      <div
        class="order-8 min-w-0 overflow-hidden border border-[#596074] bg-[#202633] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0 xl:self-start"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span
            class="flex min-w-0 items-center gap-2 truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
          >
            <span data-guide-llm-code-index class="text-secondary">01</span
            ><span data-guide-llm-code-type>CLI</span><span aria-hidden="true">•</span
            ><span data-guide-llm-code-title class="truncate"
              >{m.guide_llm_prompt_card_explainer_code_title()}</span
            >
          </span>
          <span class="flex shrink-0 items-center gap-4 text-white/75">
            <span data-guide-llm-code-navigation class="inline-flex items-center"
              ><Icon icon="proicons:chevron-left" class="size-4" aria-hidden="true" />
              <Icon
                icon="proicons:chevron-right"
                class="size-4"
                aria-hidden="true"
              /></span
            >
            <span
              data-guide-llm-code-prompt
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:auto-awesome"
                class="size-4"
                aria-hidden="true"
              />{m.guide_llm_prompt_card_prompt()}</span
            >
            <span
              data-guide-llm-code-copy
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon icon="ion:copy-outline" class="size-4" aria-hidden="true" />
              {m.common_copy()}</span
            >
          </span>
        </div>
        <div
          class="border-t border-[#596074] bg-[#182021] px-4 py-1.5 font-mono text-label-sm text-[#d6e4ff]/75"
        >
          <span data-guide-llm-code-path
            ><span class="mr-2 text-white/50">{m.guide_llm_prompt_card_path()}</span
            ><span>~/saanseoi-project</span></span
          >
        </div>
        <div
          data-guide-llm-code-content
          class="relative h-16 overflow-hidden bg-[#131722] px-4 py-3 [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <p class="font-mono text-sm leading-6 text-[#d6e4ff]/75">
            <span class="mr-2 text-secondary">$</span>bun create vite . --template
            vanilla-ts
          </p>
        </div>
      </div>
      <span
        class="hidden max-w-24 font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_code_view()}</span
      >
      <p
        bind:this={codeIndexCallout}
        class="order-1 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-span-2 xl:row-start-1 xl:order-0 xl:w-3/4 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_index()}
      </p>
      <p
        bind:this={codeTypeCallout}
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-2 xl:row-start-1 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_type()}
      </p>
      <p
        bind:this={codeTitleCallout}
        class="order-3 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_title_description()}
      </p>
      <p
        bind:this={codeNavigationCallout}
        class="order-4 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-7 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_navigation()}
      </p>
      <p
        bind:this={codePromptCallout}
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-9 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-8 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_prompt()}
      </p>
      <p
        bind:this={codeCopyCallout}
        class="order-7 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-11 xl:col-span-2 xl:row-start-2 xl:order-0 xl:w-48 xl:translate-x-4 xl:self-start xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_copy()}
      </p>
      <p
        bind:this={codePathCallout}
        class="order-9 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-3 xl:col-span-2 xl:row-start-3 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_path_description()}
      </p>
      <p
        bind:this={codeContentCallout}
        class="order-10 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_code_reference()}
      </p>
    </div>

    <div
      class="grid gap-x-5 gap-y-8 py-8 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
    >
      <div
        class="order-4 min-w-0 overflow-hidden border border-[#596074] bg-[#202633] xl:col-start-3 xl:col-span-8 xl:row-start-2 xl:order-0"
      >
        <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span class="truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
            >{m.guide_llm_prompt_card_explainer_preview_title()}</span
          >
          <span class="flex shrink-0 items-center gap-4 text-white/75">
            <span
              data-guide-llm-preview-code
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:code-rounded"
                class="size-4"
                aria-hidden="true"
              />{m.guide_code_block_code()}</span
            >
            <span
              data-guide-llm-preview-prompt
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon
                icon="material-symbols-light:auto-awesome"
                class="size-4"
                aria-hidden="true"
              />{m.guide_llm_prompt_card_prompt()}</span
            >
            <span
              data-guide-llm-preview-expand
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold"
              ><Icon icon="ion:expand-outline" class="size-4" aria-hidden="true" />
              {m.guide_code_block_expand()}</span
            >
          </span>
        </div>
        <div
          data-guide-llm-preview-content
          class="relative h-16 overflow-hidden border-t border-[#596074] bg-[#131722] p-3 [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]"
        >
          <div
            class="h-20 w-44 border border-[#6b7c96]/45 bg-[linear-gradient(135deg,#5c6f93_0_24%,#8ba9b7_24%_42%,#e4c890_42%_57%,#597e78_57%)] opacity-70"
          ></div>
        </div>
      </div>
      <span
        class="hidden font-mono text-[1.35rem] leading-none font-semibold tracking-[0.16em] text-foreground-alt/45 xl:col-span-2 xl:row-start-2 xl:flex xl:items-center"
        aria-hidden="true"
        >{m.guide_llm_prompt_card_explainer_preview_view()}</span
      >
      <p
        bind:this={previewContentCallout}
        class="order-5 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_preview()}
      </p>
      <p
        bind:this={previewExpandCallout}
        class="order-3 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 whitespace-nowrap text-foreground-alt xl:col-start-9 xl:col-span-2 xl:row-start-1 xl:order-0 xl:translate-y-12 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_preview_expand()}
      </p>
      <p
        bind:this={previewCodeCallout}
        class="order-1 max-w-72 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-6 xl:col-span-4 xl:row-start-1 xl:order-0 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_preview_code()}
      </p>
      <p
        bind:this={previewPromptCallout}
        class="order-2 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 whitespace-nowrap text-foreground-alt xl:col-start-8 xl:col-span-1 xl:row-start-1 xl:order-0 xl:translate-y-6 xl:border-l-0 xl:pl-0"
      >
        {@html m.guide_llm_prompt_card_explainer_preview_prompt()}
      </p>
    </div>
  </div>
</section>
