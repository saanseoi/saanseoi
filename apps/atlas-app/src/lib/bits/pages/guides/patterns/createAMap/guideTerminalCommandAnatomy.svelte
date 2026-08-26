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
    start: HTMLElement,
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
let copyCallout: HTMLParagraphElement
let folderCallout: HTMLParagraphElement
let promptCallout: HTMLParagraphElement

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

const path = $derived(operatingSystem === 'windows' ? 'C:\\Users\\your-name' : '~/')
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
const displayCode = $derived(`# ${comment}\n${command}`)

const socketGravity: Record<string, [number, number]> = {
  bottom: [0, 64],
  left: [-64, 0],
  right: [64, 0],
  top: [0, -64],
}

const lineOptions = (startSocket: string, endSocket: string) => ({
  color: '#65d8ba',
  endPlug: 'arrow3',
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

onMount(() => {
  let lines: LeaderLine[] = []
  let observer: ResizeObserver | undefined
  let disposed = false
  let removeScrollListener: (() => void) | undefined

  void tick()
    .then(loadLeaderLine)
    .then(LeaderLine => {
      if (disposed || !terminalCardElement) return

      const header = terminalCardElement.querySelector(':scope > div > div')
      const headerLeading = header?.querySelector(':scope > div')
      const dots = headerLeading?.firstElementChild
      const folder = headerLeading?.lastElementChild
      const copy = header?.querySelector('button')
      const codeLines =
        terminalCardElement.querySelectorAll<HTMLElement>('pre code > span')
      const commentLine = codeLines.item(0)
      const commandLine = codeLines.item(1)
      const promptElement = commandLine?.firstElementChild

      if (
        !(dots instanceof HTMLElement) ||
        !(folder instanceof HTMLElement) ||
        !(copy instanceof HTMLElement) ||
        !commentLine ||
        !(promptElement instanceof HTMLElement)
      )
        return

      lines = [
        new LeaderLine(cardCallout, dots, lineOptions('bottom', 'top')),
        new LeaderLine(folderCallout, folder, lineOptions('bottom', 'top')),
        new LeaderLine(copyCallout, copy, lineOptions('bottom', 'top')),
        new LeaderLine(
          commentCallout,
          LeaderLine.pointAnchor(commentLine, {
            x: commentLine.clientWidth,
            y: commentLine.clientHeight / 2,
          }),
          lineOptions('left', 'right'),
        ),
        new LeaderLine(promptCallout, promptElement, lineOptions('top', 'bottom')),
      ]

      const position = () => {
        lines.forEach(line => {
          line.position()
        })
      }
      observer = new ResizeObserver(position)
      observer.observe(terminalCardElement)
      ;[cardCallout, folderCallout, copyCallout, commentCallout, promptCallout].forEach(
        element => {
          observer?.observe(element)
        },
      )
      window.addEventListener('scroll', position, true)
      removeScrollListener = () => window.removeEventListener('scroll', position, true)
    })

  return () => {
    disposed = true
    removeScrollListener?.()
    observer?.disconnect()
    lines.forEach(line => {
      line.remove()
    })
  }
})
</script>

<div class="grid gap-x-5 gap-y-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_auto]">
  <div class="order-1 lg:col-span-9 lg:row-start-2 lg:order-none">
    <div bind:this={terminalCardElement}>
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({ action: m.guide_setup_install_bun(), path })}
        code={command}
        copyCode={command}
        {displayCode}
        {language}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </div>
  </div>

  <p
    bind:this={cardCallout}
    class="order-2 max-w-64 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt lg:col-span-3 lg:row-start-1 lg:order-none lg:border-l-0 lg:pl-0"
  >
    {@html m.guide_terminal_anatomy_card()}
  </p>
  <p
    bind:this={folderCallout}
    class="order-3 max-w-64 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt lg:col-start-4 lg:col-span-3 lg:row-start-1 lg:order-none lg:border-l-0 lg:pl-0"
  >
    {@html m.guide_terminal_anatomy_location()}
  </p>
  <p
    bind:this={copyCallout}
    class="order-4 max-w-64 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt lg:col-start-10 lg:col-span-3 lg:row-start-1 lg:order-none lg:border-l-0 lg:pl-0"
  >
    {@html copyInstruction}
  </p>
  <p
    bind:this={commentCallout}
    class="order-5 max-w-64 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt lg:col-start-10 lg:col-span-3 lg:row-start-2 lg:self-center lg:border-l-0 lg:pl-0"
  >
    {@html m.guide_terminal_anatomy_comment()}
  </p>
  <p
    bind:this={promptCallout}
    class="order-6 max-w-64 border-l-2 border-secondary pl-3 font-body text-body-sm leading-6 text-foreground-alt lg:col-span-4 lg:row-start-3 lg:order-none lg:border-l-0 lg:pl-0"
  >
    {@html m.guide_terminal_anatomy_prompt({ prompt })}
  </p>
</div>
