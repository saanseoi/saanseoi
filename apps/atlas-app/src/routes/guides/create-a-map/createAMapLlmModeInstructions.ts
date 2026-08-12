export type CreateAMapLlmMode = 'agentic' | 'chat'

const chatInstructions = [
  'As a web chat, we expect you cannot inspect or edit my computer directly. Guide me through the work and wait for my confirmation before continuing.',
  'Assume I am working in a new project folder. Do not ask to inspect, reuse, or adapt an existing workspace.',
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

Based on whether you are a coding agent of a web chat, follow the respective set of instructions:

### Coding agent

- Inspect the existing workspace before proposing or making changes. Preserve unrelated
  work. If the project is not the clean basis expected by the guide, say so.
- When creating the new app, use the current workspace root only if it is not the
  user's home directory and it contains no non-hidden items. Otherwise create a new
  \`saanseoi-project\` subdirectory. Preserve any hidden files and directories.
- Adapt to the actual project and its conventions. Do not create a parallel project or
  use the guide’s code snippets verbatim; implement the equivalent solution for the
  workspace you find.
- Stop for confirmation before any paid action, credential entry, deployment, or
  account-linked operation.
- An HTTP 200 response does not visually verify the app. Browser verification succeeds
  only when a browser visibly loads the Vite page. If browser access is unavailable,
  stop and ask the user to open the reported URL and tell you what they see.

### Web chat

${chatInstructions.map(instruction => `- ${instruction}`).join('\n')}`
