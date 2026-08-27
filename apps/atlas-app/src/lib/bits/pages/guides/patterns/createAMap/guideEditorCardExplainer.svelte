<script lang="ts">
import leaderLineUrl from 'leader-line/leader-line.min.js?url'
import { onMount, tick } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMapLibreBlankPreview from './guideMapLibreBlankPreview.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'

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
type Props = {
  code: string
  displayCode: string
  editorIcon?: string
}

let { code, displayCode, editorIcon }: Props = $props()
let editorCardElement = $state<HTMLDivElement>()
let editorIconCallout: HTMLParagraphElement
let pathCallout: HTMLParagraphElement
let commentsToggleCallout: HTMLParagraphElement
let copyCallout: HTMLParagraphElement
let previewCallout: HTMLParagraphElement
let codeCallout: HTMLParagraphElement
let dimmedCodeCallout: HTMLParagraphElement
let commentCallout: HTMLParagraphElement
let leaderLineLoader: Promise<LeaderLineConstructor> | undefined

const comments = $derived([
  { line: 4, text: m.guide_renderer_maplibre_comment_new_map() },
])

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
  left: [-24, 0],
  right: [24, 0],
  top: [0, -24],
}
const lineOptions = (startSocket: string, endSocket: string) => ({
  color: '#65d8ba',
  endPlug: 'arrow3',
  endPlugSize: 1.4,
  endSocket,
  endSocketGravity: socketGravity[endSocket],
  outline: true,
  outlineColor: '#0c1111',
  outlineSize: 0.7,
  path: 'fluid',
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
          !editorCardElement
        ) {
          lineSetupStarted = false
          return
        }

        const codePanel = editorCardElement.querySelector('pre')?.parentElement
        const header = codePanel?.querySelector(':scope > div:first-child')
        const headerLeading = header?.querySelector(':scope > div:first-child')
        const icon = headerLeading?.firstElementChild
        const path = headerLeading?.lastElementChild
        const commentsToggle = header?.querySelector(
          '[data-guide-code-comments-toggle]',
        )
        const copy = header?.querySelector('[data-guide-code-copy]')
        const preview = header?.querySelector('[data-guide-code-preview]')
        const codeLines = Array.from(
          editorCardElement.querySelectorAll<HTMLElement>('pre code > span'),
        )
        const imports = codeLines.find(line =>
          line.textContent?.startsWith("import { Map } from 'maplibre-gl'"),
        )
        const comment = codeLines.find(line => line.textContent?.startsWith('// '))
        const mapCode = codeLines.find(line => line.textContent?.startsWith('new Map'))

        if (
          !(icon instanceof HTMLElement) ||
          !(path instanceof HTMLElement) ||
          !(commentsToggle instanceof HTMLElement) ||
          !(copy instanceof HTMLElement) ||
          !(preview instanceof HTMLElement) ||
          !imports ||
          !comment ||
          !mapCode
        ) {
          lineSetupStarted = false
          return
        }

        const iconSize = dimensions(icon)
        const pathSize = dimensions(path)
        const commentsToggleSize = dimensions(commentsToggle)
        const copySize = dimensions(copy)
        const previewSize = dimensions(preview)
        const importsSize = dimensions(imports)
        const commentSize = dimensions(comment)
        const mapCodeSize = dimensions(mapCode)
        lines = [
          new LeaderLine(
            editorIconCallout,
            LeaderLine.pointAnchor(icon, { x: iconSize.width / 2, y: 0 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            pathCallout,
            LeaderLine.pointAnchor(path, { x: pathSize.width / 2, y: 0 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            commentsToggleCallout,
            LeaderLine.pointAnchor(commentsToggle, {
              x: commentsToggleSize.width / 2,
              y: 0,
            }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            copyCallout,
            LeaderLine.pointAnchor(copy, { x: copySize.width / 2, y: 0 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            previewCallout,
            LeaderLine.pointAnchor(preview, { x: previewSize.width / 2, y: 0 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            commentCallout,
            LeaderLine.pointAnchor(comment, {
              x: -12,
              y: commentSize.height / 2,
            }),
            lineOptions('top', 'left'),
          ),
          new LeaderLine(
            codeCallout,
            LeaderLine.pointAnchor(mapCode, {
              x: mapCodeSize.width / 2,
              y: mapCodeSize.height + 12,
            }),
            lineOptions('top', 'bottom'),
          ),
          new LeaderLine(
            dimmedCodeCallout,
            LeaderLine.pointAnchor(imports, {
              x: importsSize.width * 0.7,
              y: importsSize.height + 12,
            }),
            lineOptions('top', 'bottom'),
          ),
        ]

        const position = () => {
          lines.forEach(line => {
            line.position()
          })
        }
        observer = new ResizeObserver(position)
        observer.observe(editorCardElement)
        ;[
          editorIconCallout,
          pathCallout,
          commentsToggleCallout,
          copyCallout,
          previewCallout,
          codeCallout,
          dimmedCodeCallout,
          commentCallout,
        ].forEach(element => {
          observer?.observe(element)
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
  class="mt-8 max-w-3xl space-y-5"
  aria-label={m.guide_editor_card_explainer_title()}
>
  <h4 class="font-display text-headline-sm font-bold text-primary">
    {@html m.guide_editor_card_explainer_title()}
  </h4>
  <div
    class="grid gap-x-5 gap-y-4 xl:-mr-56 xl:gap-y-17 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
  >
    <div class="order-1 xl:col-start-3 xl:col-span-7 xl:row-start-2 xl:order-0">
      <div
        bind:this={editorCardElement}
        class="relative max-sm:**:data-guide-code-header:items-start max-sm:**:data-guide-code-header:flex-col max-sm:**:data-guide-code-header:gap-2 max-sm:**:data-guide-code-actions:w-full max-sm:**:data-guide-code-actions:justify-between max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:relative max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:absolute max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:top-[-0.55rem] max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:right-[-0.55rem] max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:inline-flex max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:size-4.5 max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:items-center max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:justify-center max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:rounded-full max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:bg-secondary max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:font-mono max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:text-[0.6875rem] max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:font-bold max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:leading-none max-xl:[&_:is([data-guide-code-editor-icon],[data-guide-code-label],[data-guide-code-comments-toggle],[data-guide-code-copy],[data-guide-code-preview])]:after:text-on-secondary max-xl:**:data-guide-code-editor-icon:after:content-['1'] max-xl:**:data-guide-code-label:after:content-['2'] max-xl:**:data-guide-code-comments-toggle:after:content-['3'] max-xl:**:data-guide-code-preview:after:content-['4'] max-xl:**:data-guide-code-copy:after:content-['5'] max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:relative max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:absolute max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:top-[0.15rem] max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:left-[-1.35rem] max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:inline-flex max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:size-4.5 max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:items-center max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:justify-center max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:rounded-full max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:bg-secondary max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:font-mono max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:text-[0.6875rem] max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:font-bold max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:leading-none max-xl:[&_:is([data-code-line='4'],[data-code-line='1'])]:before:text-on-secondary max-xl:**:data-[code-line='4']:before:content-['7'] max-xl:**:data-[code-line='1']:before:content-['8'] max-xl:**:data-[code-comment-for='4']:relative max-xl:**:data-[code-comment-for='4']:pl-6 max-xl:**:data-[code-comment-for='4']:before:absolute max-xl:**:data-[code-comment-for='4']:before:top-[0.15rem] max-xl:**:data-[code-comment-for='4']:before:left-0 max-xl:**:data-[code-comment-for='4']:before:inline-flex max-xl:**:data-[code-comment-for='4']:before:size-4.5 max-xl:**:data-[code-comment-for='4']:before:items-center max-xl:**:data-[code-comment-for='4']:before:justify-center max-xl:**:data-[code-comment-for='4']:before:rounded-full max-xl:[&_[data-code-comment-for='4']]:before:bg-secondary max-xl:**:data-[code-comment-for='4']:before:font-mono max-xl:**:data-[code-comment-for='4']:before:text-[0.6875rem] max-xl:**:data-[code-comment-for='4']:before:font-bold max-xl:**:data-[code-comment-for='4']:before:leading-none max-xl:[&_[data-code-comment-for='4']]:before:text-on-secondary max-xl:**:data-[code-comment-for='4']:before:content-['6']"
      >
        <GuidePreviewCodeBlock
          {code}
          {displayCode}
          {comments}
          dimmedLines={[1, 2]}
          {editorIcon}
          label="src/main.ts"
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
          closeLabel={m.common_close()}
        >
          {#snippet preview()}
            <GuideMapLibreBlankPreview />
          {/snippet}
        </GuidePreviewCodeBlock>
      </div>
    </div>
    <p
      bind:this={editorIconCallout}
      class="order-2 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-span-3 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >1</span
      >
      {@html m.guide_editor_card_explainer_icon()}
    </p>
    <p
      bind:this={pathCallout}
      class="order-3 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-4 xl:col-span-3 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >2</span
      >
      {@html m.guide_editor_card_explainer_path()}
    </p>
    <p
      bind:this={commentsToggleCallout}
      class="order-4 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-7 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >3</span
      >
      {@html m.guide_editor_card_explainer_comments_toggle()}
    </p>
    <p
      bind:this={previewCallout}
      class="order-5 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-9 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >4</span
      >
      {@html m.guide_editor_card_explainer_preview()}
    </p>
    <p
      bind:this={copyCallout}
      class="order-6 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-11 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >5</span
      >
      {@html m.guide_editor_card_explainer_copy()}
    </p>
    <p
      bind:this={commentCallout}
      class="order-7 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-1 xl:col-span-4 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >6</span
      >
      {@html m.guide_editor_card_explainer_comment()}
    </p>
    <p
      bind:this={codeCallout}
      class="order-8 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >7</span
      >
      {@html m.guide_editor_card_explainer_code()}
    </p>
    <p
      bind:this={dimmedCodeCallout}
      class="order-9 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-8 xl:col-span-5 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
    >
      <span
        class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
        aria-hidden="true"
        >8</span
      >
      {@html m.guide_editor_card_explainer_dimmed_code()}
    </p>
  </div>
</section>
