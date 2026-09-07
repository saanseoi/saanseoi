import { Console } from 'node:console'
import { styleText } from 'node:util'

const OUTPUT_TOKEN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]|[\\s\\S]`,
  'g',
)

let closeInitialisationGuide = () => {}

export function finishInitialisationGuide() {
  closeInitialisationGuide()
}

/** Only init commands actually invoked in this run contribute a level. */
export function initialisationIndent(command: string | undefined, guides = '') {
  const depth = guides
    .split(',')
    .filter(value => value !== '' && Number.isInteger(Number(value))).length
  const isInit = command === 'init' || command?.startsWith('init:')
  return Math.max(0, depth - (isInit ? 0 : 1)) * 4
}

export function createIndentedOutput(
  width: number,
  ancestors: number[] = [],
  connect = false,
  colour = false,
) {
  const guides = new Set(ancestors.filter(depth => depth >= 0 && depth < width))
  const prefix = Array.from({ length: width }, (_, column) =>
    guides.has(column) ? '│' : ' ',
  ).join('')
  const parent = Math.max(-1, ...guides)
  let lineStart = true
  let activeStyles = ''
  const guide = (value: string) =>
    colour ? `\u001b[90m${value}\u001b[39m${activeStyles}` : value
  return (text: string) => {
    let result = ''
    // Keep escape sequences intact; absolute column moves must include the margin.
    for (const token of text.match(OUTPUT_TOKEN) ?? []) {
      if (token === '\n' || token === '\r') {
        if (token === '\n' && lineStart && guides.size) result += guide(`${prefix}│`)
        result += token
        lineStart = true
      } else if (token.startsWith('\u001b[')) {
        if (token.endsWith('m')) {
          if (token === '\u001b[0m' || token === '\u001b[m') activeStyles = ''
          else if (/^(?:3[0-9]|9[0-7])m$/.test(token.slice(2))) activeStyles = token
        }
        const column = /^(\d*)G$/.exec(token.slice(2))
        if (column) {
          result += `\u001b[${Number(column[1] || 1) + width}G`
          lineStart = false
        } else {
          result += token
        }
      } else {
        if (lineStart && connect && parent >= 0 && token === '│') {
          result += guide(
            `${prefix.slice(0, parent)}├${'─'.repeat(width - parent - 1)}╮`,
          )
        } else {
          if (lineStart) result += guide(prefix)
          result += lineStart && guides.size && token === '└' ? '├' : token
        }
        connect = false
        lineStart = false
      }
    }
    return result
  }
}

export function installInitialisationIndent(command: string | undefined) {
  const owner =
    command === 'init' || command?.startsWith('init:')
      ? command
      : process.env.SAANSEOI_INIT_COMMAND
  const width = initialisationIndent(command, process.env.SAANSEOI_INIT_GUIDES)
  if (!width) return
  const ancestors = (process.env.SAANSEOI_INIT_GUIDES ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isInteger)
  const colour = styleText('gray', '│') !== '│'
  if (owner === command) {
    const write = process.stdout.write.bind(process.stdout)
    const parent = Math.max(-1, ...ancestors.filter(depth => depth < width))
    closeInitialisationGuide = () => {
      if (parent < 0) return
      const prefix = Array.from({ length: parent }, (_, column) =>
        ancestors.includes(column) ? '│' : ' ',
      ).join('')
      const connector = `${prefix}├${'─'.repeat(width - parent - 1)}╯`
      write(`${colour ? styleText('gray', connector) : connector}\n`)
    }
  }
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream)
    const indent = createIndentedOutput(
      width,
      ancestors,
      owner === command && stream === process.stdout,
      colour,
    )
    stream.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: unknown,
      callback?: unknown,
    ) => {
      const encoding =
        typeof encodingOrCallback === 'string'
          ? (encodingOrCallback as BufferEncoding)
          : undefined
      const text =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding)
      return write(
        indent(text),
        encodingOrCallback as BufferEncoding,
        callback as () => void,
      )
    }) as typeof stream.write
    if (stream.columns) {
      Object.defineProperty(stream, 'columns', {
        configurable: true,
        value: Math.max(1, stream.columns - width),
      })
    }
  }
  const columns = Number(process.env.SAANSEOI_TERMINAL_COLUMNS)
  if (columns > 0 && !process.stdout.columns) {
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: Math.max(1, columns - width),
    })
  }
  // Bun's global console bypasses stream.write; route text through the same margin.
  const indentedConsole = new Console(process.stdout, process.stderr)
  for (const method of ['log', 'info', 'debug', 'warn', 'error'] as const) {
    console[method] = indentedConsole[method].bind(indentedConsole)
  }
}
