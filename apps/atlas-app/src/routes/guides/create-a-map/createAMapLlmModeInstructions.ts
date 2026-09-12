import {
  createAMapLlmAgenticWorkingAgreementInstructions,
  createAMapLlmChatWorkingAgreementInstructions,
} from './createAMapLlmOverviewInstructions'

export type CreateAMapLlmMode = 'agentic' | 'chat'

const chatInstructions = [
  'As a web chat, we expect you cannot inspect or edit my computer directly. Guide me through the work and wait for my confirmation before continuing.',
  'Assume I am working in a new project folder. Do not ask to inspect, reuse, or adapt an existing workspace.',
  'Before setup, have me inspect the operating system and shell, check whether Bun is already installed, and check whether `saanseoi-project` exists. If it exists, stop and ask whether it is the intended project; never overwrite it.',
  'Give one safe action at a time and wait for my result before continuing.',
  'For every action, name the exact paste target: either the terminal and its working directory, such as “Terminal in `saanseoi-project`”, or the editor window and file, such as “Editor window in `src/main.ts`”. State whether I should create, replace, or append the content.',
]

const commonAgentInstruction =
  'IMPORTANT: This is a collaborative assistance session, not a full hand-over. Do not take ownership of the project or continue beyond the requested section.'
const assistanceInstructions: Record<CreateAMapLlmMode, string[]> = {
  agentic: [commonAgentInstruction],
  chat: [commonAgentInstruction, ...chatInstructions],
}

export const createAMapLlmAssistanceModeInstructions = (mode: CreateAMapLlmMode) => {
  const [importantInstruction, ...modeInstructions] = assistanceInstructions[mode]

  return modeInstructions.length > 0
    ? [
        ...modeInstructions.map(instruction => `- ${instruction}`),
        '',
        importantInstruction,
      ]
    : [importantInstruction]
}

export const createAMapLlmInteractionModeInstructions = () =>
  `## Interaction mode

Based on whether you are a coding agent or a web chat, follow the respective set of instructions:

### Coding agent

${createAMapLlmAgenticWorkingAgreementInstructions()}

### Web chat

${[
  ...chatInstructions.map(instruction => `- ${instruction}`),
  createAMapLlmChatWorkingAgreementInstructions(),
].join('\n')}`
