import {
  createAMapLlmOverviewInstructions,
  createAMapLlmWorkingAgreementInstructions,
} from './createAMapLlmOverviewInstructions'
import { createAMapLlmInteractionModeInstructions } from './createAMapLlmModeInstructions'
import {
  createAMapLlmAssistancePrerequisitesInstructions,
  createAMapLlmPrerequisitesInstructions,
} from './createAMapLlmPrerequisitesInstructions'
import { createAMapLlmLaterSectionInstructions } from './createAMapLlmLaterSectionInstructions'
import { createAMapLlmDecisionMatrixInstructions } from './createAMapLlmDecisionMatrix'

const joinInstructions = (sections: string[]) =>
  sections.map(section => section.trim()).join('\n\n')

const llmsTextLineWidth = 88

/**
 * Keep the generated hand-over document readable when a source section contains a
 * long prose string. Code, headings, tables and URLs are left intact; prose is wrapped
 * at word boundaries with the existing list indentation preserved.
 */
const wrapLlmsText = (markdown: string) => {
  const lines = markdown.split('\n')
  const wrapped: string[] = []
  let inCodeFence = false

  type TextBuffer = {
    continuationPrefix: string
    listPrefix?: string
    text: string[]
  }
  let buffer: TextBuffer | undefined

  const flushBuffer = () => {
    if (!buffer) return
    const firstPrefix = buffer.listPrefix ?? buffer.continuationPrefix
    const words = buffer.text.join(' ').split(/\s+/)
    const lineParts: Array<{ prefix: string; words: string[] }> = []
    let currentWords: string[] = []
    let currentPrefix = firstPrefix

    const pushCurrent = () => {
      if (currentWords.length > 0) {
        lineParts.push({ prefix: currentPrefix, words: currentWords })
      }
    }

    let breakAfterUrl = false
    for (const word of words) {
      // Keep the long, code-formatted preview URLs on their own line. This avoids
      // forcing the short word before or after a URL onto an orphan line.
      if (breakAfterUrl) {
        pushCurrent()
        currentWords = []
        currentPrefix = buffer.continuationPrefix
        breakAfterUrl = false
      }

      if (/^`https?:\/\//.test(word) && currentWords.length > 0) {
        pushCurrent()
        currentWords = []
        currentPrefix = buffer.continuationPrefix
      }

      const candidate = [...currentWords, word].join(' ')
      if (
        currentWords.length > 0 &&
        currentPrefix.length + candidate.length > llmsTextLineWidth
      ) {
        pushCurrent()
        currentWords = [word]
        currentPrefix = buffer.continuationPrefix
      } else {
        currentWords.push(word)
      }

      if (/^`https?:\/\//.test(word)) breakAfterUrl = true
    }
    pushCurrent()

    // Avoid very short orphans and dangling conjunctions on wrapped prose. Rebalance
    // from the preceding line when there is room, while preserving indentation and list
    // markers.
    const danglingWord =
      /^(?:a|an|and|as|at|because|before|but|by|for|from|if|in|of|on|or|so|than|that|the|to|what|when|which|with)$/i
    for (let index = 1; index < lineParts.length; index += 1) {
      const part = lineParts[index]
      while (
        part.words.length < 4 ||
        danglingWord.test(lineParts[index - 1]?.words.at(-1) ?? '')
      ) {
        const previous = lineParts[index - 1]
        if (!previous || previous.words.length <= 4) break
        const moved = previous.words.at(-1)
        if (!moved) break
        const candidateWords = [moved, ...part.words]
        if (part.prefix.length + candidateWords.join(' ').length > llmsTextLineWidth) {
          break
        }
        previous.words.pop()
        part.words = candidateWords
      }
    }

    for (const part of lineParts) {
      wrapped.push(`${part.prefix}${part.words.join(' ')}`)
    }
    buffer = undefined
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      flushBuffer()
      wrapped.push(line)
      inCodeFence = !inCodeFence
      continue
    }

    if (inCodeFence) {
      wrapped.push(line)
      continue
    }

    if (
      trimmed === '' ||
      /^#{1,6}\s/.test(trimmed) ||
      /^\|/.test(trimmed) ||
      /^Target:\s/.test(trimmed)
    ) {
      flushBuffer()
      wrapped.push(line)
      continue
    }

    const listMatch = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+))(.*)$/)
    if (listMatch) {
      flushBuffer()
      buffer = {
        continuationPrefix: ' '.repeat(listMatch[1].length),
        listPrefix: listMatch[1],
        text: [listMatch[2]],
      }
      continue
    }

    if (buffer?.listPrefix) {
      buffer.text.push(trimmed)
      continue
    }

    const indentation = line.match(/^\s*/)?.[0] ?? ''
    if (!buffer) {
      buffer = { continuationPrefix: indentation, text: [trimmed] }
    } else {
      buffer.text.push(trimmed)
    }
  }

  flushBuffer()
  return wrapped.join('\n')
}

/** The complete Markdown guide served from `/guides/create-a-map/llms.txt`. */
export const createAMapLlmInstructions = () =>
  wrapLlmsText(
    joinInstructions([
      createAMapLlmOverviewInstructions(),
      createAMapLlmWorkingAgreementInstructions(),
      createAMapLlmInteractionModeInstructions(),
      createAMapLlmDecisionMatrixInstructions(),
      createAMapLlmPrerequisitesInstructions(),
      createAMapLlmLaterSectionInstructions(),
    ]),
  )

/** Shared setup material included in the first collaborative assistance prompt. */
export const createAMapPrerequisitesInstructions = (input?: {
  assistanceMode?: 'agentic' | 'chat'
  hostingValue?: string
  objective?: string
  operatingSystem?: string
  terminalExperienceValue?: string
}) =>
  joinInstructions([
    createAMapLlmWorkingAgreementInstructions(input?.assistanceMode),
    createAMapLlmAssistancePrerequisitesInstructions(input),
  ])
