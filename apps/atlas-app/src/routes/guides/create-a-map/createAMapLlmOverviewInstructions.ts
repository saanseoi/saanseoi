const instructions = `
# SaanSeoi: "Create a Map" guide for LLMs

I am following the SaanSeoi Create a Map guide and would like your help to build my map
project. Please read this file before helping me. Treat it as the canonical brief for my
full hand-over: follow the guide in order, ask me only when a decision or action needs my
input, and guide me through any work I must do on my own computer.

The guide itself is written in English. The handover prompt supplies the locale selected
on the SaanSeoi site; interact with the user in that locale while keeping code, commands,
URL parameters and technical literals unchanged.
`

export const createAMapLlmOverviewInstructions = () => instructions

const workingAgreement = `
## Working agreement

- Build my project in this order: prerequisites; rendering; basemap; style; data
  (fetch District statistics, calculate population density, put the statistics on the
  map, identify land without human habitats, calculate liveable area, and finalise the
  map); then publishing and embedding only when my chosen objective requires them.
- Ask concise questions for missing decisions. Do not guess credentials, deployment
  targets, or platform configuration.
- Use simple language and explain mapping concepts as I follow the guide. Avoid going into technical detail unless it is required to clarify the implementation.`

const chatWorkingAgreement = `
- If I report being stuck after editing code, ask me to paste the files you asked me to
  create or change so that you can check them.
- After code that changes the browser result, invite me to look at it, explain what I
  should see, and ask me to confirm it.`

const agenticWorkingAgreement = `
- Inspect the existing workspace before proposing or making changes. Preserve unrelated
  work. If the project is not the clean basis expected by the guide, say so.
- When creating the new app, use the current workspace root only if it is not the user's home
  directory and contains no non-hidden items. Otherwise create a new
  \`saanseoi-project\` subdirectory. Preserve hidden files and directories.
- Adapt to the actual project and its conventions. Do not create a parallel project or
  use the guide’s snippets verbatim; implement their equivalent for the workspace you
  find.
- After a browser-visible code change, ask me to inspect it, explain what I should see,
  and ask me to confirm it.
- Inspect the operating system and shell. Follow the OS commands for the system you are
  on and ignore the commands for other operating systems.
- Stop for confirmation before any paid action, credential entry, deployment, or
  account-linked operation.
- An HTTP 200 response does not visually verify the app. Browser verification succeeds
  only when a browser visibly loads the Vite page. If browser access is unavailable,
  stop and ask me to open the reported URL and tell you what I see.`

/**
 * Return the common agreement, optionally followed by the agreement for a
 * collaborative assistance mode. The canonical `llms.txt` hand-over calls this
 * without a mode so that mode-specific guidance stays under its mode heading.
 */
export const createAMapLlmWorkingAgreementInstructions = (mode?: 'agentic' | 'chat') =>
  [
    workingAgreement,
    ...(mode === 'agentic'
      ? [agenticWorkingAgreement]
      : mode === 'chat'
        ? [chatWorkingAgreement]
        : []),
  ]
    .map(section => section.trim())
    .join('\n')

export const createAMapLlmChatWorkingAgreementInstructions = () =>
  chatWorkingAgreement.trim()

export const createAMapLlmAgenticWorkingAgreementInstructions = () =>
  agenticWorkingAgreement.trim()
