<script lang="ts">
import leaderLineUrl from 'leader-line/leader-line.min.js?url'
import { onMount, tick } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'

type OperatingSystem = 'windows' | 'macos' | 'linux'
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

type Props = { operatingSystem?: OperatingSystem }

let { operatingSystem }: Props = $props()

let terminalCardElement = $state<HTMLDivElement>()
let cardCallout: HTMLParagraphElement
let commentCallout: HTMLParagraphElement
let commandCallout: HTMLParagraphElement
let copyCallout: HTMLParagraphElement
let folderCallout: HTMLParagraphElement
let promptCallout: HTMLParagraphElement
let titleCallout: HTMLParagraphElement

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

const path = $derived(operatingSystem === 'windows' ? '~' : '~/')
const language = $derived(operatingSystem === 'windows' ? 'powershell' : 'bash')
const prompt = $derived(operatingSystem === 'windows' ? 'PS>' : '$')
const command = 'curl -fsSL https://bun.sh/install | bash'
const comment = $derived(m.guide_terminal_anatomy_code_comment())
const copyInstruction = $derived(
  operatingSystem === 'windows'
    ? m.guide_terminal_anatomy_copy_windows()
    : operatingSystem === 'macos'
      ? m.guide_terminal_anatomy_copy_macos()
      : m.guide_terminal_anatomy_copy_linux(),
)
const locationInstruction = $derived(
  operatingSystem === 'windows'
    ? m.guide_terminal_anatomy_location_windows()
    : m.guide_terminal_anatomy_location(),
)
const displayCode = $derived(`# ${comment}\n${command}`)

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
          !terminalCardElement
        ) {
          lineSetupStarted = false
          return
        }

        const header = terminalCardElement.querySelector(':scope > div > div')
        const headerLeading = header?.querySelector(':scope > div')
        const dots = headerLeading?.firstElementChild
        const folder = headerLeading?.querySelector<HTMLElement>('[data-terminal-path]')
        const title = headerLeading?.querySelector<HTMLElement>('[data-terminal-title]')
        const copy = header?.querySelector('button')
        const codeLines =
          terminalCardElement.querySelectorAll<HTMLElement>('pre code > span')
        const commentLine = codeLines.item(0)
        const commandLine = codeLines.item(1)
        const commentText = commentLine?.lastElementChild
        const promptElement = commandLine?.firstElementChild

        if (
          !(dots instanceof HTMLElement) ||
          !(folder instanceof HTMLElement) ||
          !(title instanceof HTMLElement) ||
          !(copy instanceof HTMLElement) ||
          !commentLine ||
          !(commentText instanceof HTMLElement) ||
          !(promptElement instanceof HTMLElement) ||
          !commandLine
        ) {
          lineSetupStarted = false
          return
        }

        const dotsSize = dimensions(dots)
        const folderCalloutSize = dimensions(folderCallout)
        const folderSize = dimensions(folder)
        const titleSize = dimensions(title)
        const copySize = dimensions(copy)
        const commentSize = dimensions(commentText)
        const promptSize = dimensions(promptElement)
        const commandSize = dimensions(commandLine)

        lines = [
          new LeaderLine(
            cardCallout,
            LeaderLine.pointAnchor(dots, { x: dotsSize.width / 2, y: -12 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            LeaderLine.pointAnchor(folderCallout, {
              x: folderCalloutSize.width * 0.2,
              y: folderCalloutSize.height,
            }),
            LeaderLine.pointAnchor(folder, { x: folderSize.width / 2, y: -12 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            titleCallout,
            LeaderLine.pointAnchor(title, { x: titleSize.width / 2, y: -12 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            copyCallout,
            LeaderLine.pointAnchor(copy, { x: copySize.width / 2, y: -12 }),
            lineOptions('bottom', 'top'),
          ),
          new LeaderLine(
            commentCallout,
            LeaderLine.pointAnchor(commentText, {
              x: commentSize.width,
              y: commentSize.height,
            }),
            lineOptions('top', 'bottom'),
          ),
          new LeaderLine(
            promptCallout,
            LeaderLine.pointAnchor(promptElement, {
              x: promptSize.width / 2,
              y: promptSize.height + 12,
            }),
            lineOptions('top', 'bottom'),
          ),
          new LeaderLine(
            commandCallout,
            LeaderLine.pointAnchor(commandLine, {
              x: commandSize.width / 2,
              y: commandSize.height + 12,
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
        observer.observe(terminalCardElement)
        ;[
          cardCallout,
          folderCallout,
          titleCallout,
          copyCallout,
          commentCallout,
          promptCallout,
          commandCallout,
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

<div
  class="grid gap-x-5 gap-y-4 xl:-mr-56 xl:gap-y-17 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto]"
>
  <div class="order-1 xl:col-start-3 xl:col-span-7 xl:row-start-2 xl:order-0">
    <div
      bind:this={terminalCardElement}
      class="relative max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:mr-2 max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:inline-flex max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:size-4.5 max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:items-center max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:justify-center max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:rounded-full max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:bg-secondary max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:font-mono max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:text-[0.6875rem] max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:font-bold max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:leading-none max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:align-text-bottom max-xl:[&_:is(pre_code_>_span:nth-child(1),pre_code_>_span:nth-child(2)_>_span:first-child,pre_code_>_span:nth-child(2)_>_span:nth-child(2))]:before:text-on-secondary max-xl:[&_pre_code_>_span:nth-child(1)]:before:content-['5'] max-xl:[&_pre_code_>_span:nth-child(2)_>_span:first-child]:before:content-['6'] max-xl:[&_pre_code_>_span:nth-child(2)_>_span:nth-child(2)]:before:content-['7']"
    >
      {#snippet dotsReference()}
        <span
          class="ml-1 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
          aria-hidden="true"
          >1</span
        >
      {/snippet}
      {#snippet terminalLabel()}
        <span class="inline-flex items-center gap-1.5">
          <span data-terminal-path class="inline-flex"
            >{path}
            <sup
              class="inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
              >2</sup
            ></span
          >
          <span aria-hidden="true">•</span>
          <span data-terminal-title class="inline-flex"
            >{m.guide_setup_install_bun()}
            <sup
              class="inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
              >3</sup
            ></span
          >
        </span>
      {/snippet}
      {#snippet copyReference()}
        <span
          class="ml-0.5 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
          aria-hidden="true"
          >4</span
        >
      {/snippet}
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({ action: m.guide_setup_install_bun(), path })}
        labelContent={terminalLabel}
        code={command}
        copyCode={command}
        {displayCode}
        {language}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        copyLabelSuffix={copyReference}
        terminalDotsSuffix={dotsReference}
      />
    </div>
  </div>

  <p
    bind:this={cardCallout}
    class="order-2 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-span-3 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >1</span
    >
    {@html m.guide_terminal_anatomy_card()}
  </p>
  <p
    bind:this={folderCallout}
    class="order-3 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-4 xl:col-span-4 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >2</span
    >
    {@html locationInstruction}
  </p>
  <p
    bind:this={titleCallout}
    class="order-4 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-8 xl:col-span-2 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >3</span
    >
    {@html m.guide_terminal_anatomy_action()}
  </p>
  <p
    bind:this={copyCallout}
    class="order-5 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-10 xl:col-span-3 xl:row-start-1 xl:order-0 xl:self-end xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >4</span
    >
    {@html copyInstruction}
  </p>
  <p
    bind:this={commentCallout}
    class="order-6 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-9 xl:col-span-4 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >5</span
    >
    {@html m.guide_terminal_anatomy_comment()}
  </p>
  <p
    bind:this={promptCallout}
    class="order-7 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-1 xl:col-span-3 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >6</span
    >
    {@html m.guide_terminal_anatomy_prompt({ prompt })}
  </p>
  <p
    bind:this={commandCallout}
    class="order-8 max-w-none border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt xl:col-start-5 xl:col-span-3 xl:row-start-3 xl:order-0 xl:self-start xl:border-l-0 xl:pl-0"
  >
    <span
      class="mr-2 inline-flex size-4.5 items-center justify-center rounded-full bg-secondary font-mono text-[0.6875rem] font-bold leading-none text-on-secondary align-text-bottom xl:hidden"
      aria-hidden="true"
      >7</span
    >
    {@html m.guide_terminal_anatomy_command()}
  </p>
</div>
