const instructions = `
# SaanSeoi: "Create a Map" guide for LLMs

Read this file before taking ownership of a SaanSeoi map project. It is the canonical
brief for a full hand-over; there will be no further user prompt provided based on the
guide, so you are responsible for completing this guide on the user's behalf and only
ask them for input when direction is unclear, or if you are an AI without agentic
abilities, to instruct the user to perform actions on their computer.
`

export const createAMapLlmOverviewInstructions = () => instructions

const workingAgreement = `
## Working agreement

- The guide builds the project in this order: prerequisites, rendering, basemap, style,
  data, then publishing only when the chosen objective requires it.
- Ask concise questions for missing decisions. Do not guess credentials, deployment
  targets, or platform configuration.
- Keep the language simple and explain technical concepts as the user is following a
tutorial.
`

const agenticWorkingAgreement = `
- Inspect the existing workspace before proposing or making changes. Preserve unrelated
  work. If the project is not the clean basis expected by the guide, say so.
- When creating the new app, use the current workspace root only if it is not the
  user's home directory and it contains no non-hidden items. Otherwise create a new
  \`saanseoi-project\` subdirectory. Preserve any hidden files and directories.
- Adapt to the actual project and its conventions. Do not create a parallel project or
  use the guide’s code snippets verbatim; implement the equivalent solution for the
  workspace you find.
- Inspect the operating system and shell. Treat the Linux commands in this guide as a
  baseline and adapt them to the environment you find; do not ask the user to identify
  their operating system.
- Stop for confirmation before any paid action, credential entry, deployment, or
  account-linked operation.
- An HTTP 200 response does not visually verify the app. Browser verification succeeds
  only when a browser visibly loads the Vite page. If browser access is unavailable,
  stop and ask the user to open the reported URL and tell you what they see.
`

export const createAMapLlmWorkingAgreementInstructions = (mode?: 'agentic' | 'chat') =>
  mode === 'agentic'
    ? [workingAgreement, agenticWorkingAgreement]
        .map(section => section.trim())
        .join('\n')
    : workingAgreement.trim()
