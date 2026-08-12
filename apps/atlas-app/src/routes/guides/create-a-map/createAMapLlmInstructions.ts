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

const joinInstructions = (sections: string[]) =>
  sections.map(section => section.trim()).join('\n\n')

/** The complete Markdown guide served from `/guides/create-a-map/llms.txt`. */
export const createAMapLlmInstructions = () =>
  joinInstructions([
    createAMapLlmOverviewInstructions(),
    createAMapLlmWorkingAgreementInstructions(),
    createAMapLlmInteractionModeInstructions(),
    createAMapLlmPrerequisitesInstructions(),
    createAMapLlmLaterSectionInstructions(),
  ])

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
