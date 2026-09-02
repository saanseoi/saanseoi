const prerequisiteHeading = '## Prerequisites'

const discoveryInstructions = `${prerequisiteHeading}

### Ask these questions first

Ask only for decisions that are not already supplied in the accompanying user prompt.
Ask the questions in this order, waiting for each answer before asking the next one.

1. **Use case:** “Where do you want your map to be available?” Offer these options:
   - **On my computer** — a private prototype or local setup.
   - **Online with a link** — a map people can visit in a browser.
   - **Embedded in a site** — a map inside an existing site or web app.
2. **Build environment:** inspect the workspace to determine the operating system and
   shell. The Linux commands below are the baseline; adapt them to the environment you
   find. Do not ask the user to identify their operating system.
3. **Destination details:** ask the follow-up question that matches the chosen use case.
   - For **Online with a link**, ask: “Where will you host the map?” Offer:
     - **Cloudflare — Recommended:** global coverage and a generous free tier; the
       default choice unless the user already prefers GitHub.
     - **GitHub Pages — Recommended:** static hosting from a GitHub repository, with
       simple version-controlled updates; recommend it when the user already has, or
       wants to use, GitHub.
     - **Another host:** a provider the user already knows or has an account with.
   - For **Embedded in a site**, ask: “What is the map embedded in?” Offer:
     - **WordPress:** use a Custom HTML block for the published map’s iframe.
     - **Squarespace:** use a Code Block for the published map’s iframe.
     - **Wix:** use an Embed HTML element for the published map’s iframe.
     - **Webflow:** use a Code Embed element for the published map’s iframe.
     - **Another platform:** this guide has no iframe recipe; build and publish the map
       first, then consult that platform’s integration documentation.
   - After selecting a supported site platform, ask the same hosting question and offer
     the same hosting options. Prefer **Cloudflare — Recommended**, unless the user
     already has or wants to use GitHub, in which case prefer **GitHub Pages —
     Recommended**.
`

const projectSetupSafetyInstructions =
  `Managed hidden folders such as \`.agents\`, \`.codex\`, and \`.git\` may already exist;
preserve them. If Vite says the directory is non-empty, choose “Ignore files and
continue” — never “Remove existing files.”

\`saanseoi-project\` is the default only when a new subdirectory is required. A coding
agent must follow the workspace-location policy in the interaction instructions and
adapt the commands below when creating the app in the current workspace root.
`.trim()

const unixViteCreateCommand = String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`

const projectSetupInstructions = `### Create a new web-map project

For a new **on-computer**, **online**, or **site-embed** web map, use Bun and
TypeScript. Use the appropriate commands in the chosen working directory — in this
tutorial, \`saanseoi-project\`.

${projectSetupSafetyInstructions}

#### Linux

\`\`\`bash
curl -fsSL https://bun.sh/install | bash

mkdir saanseoi-project
cd saanseoi-project
# If Vite says the directory is non-empty, select “Ignore files and continue”.
# Never select “Remove existing files.”
# This sends two Down-arrow presses and Enter to select “Ignore files and continue”.
# The --no-immediate flag selects “No” for installing and starting now.
${unixViteCreateCommand}
bun install
\`\`\`

#### macOS

Use the following commands. Skip the Bun installation command if Bun is already
installed, and ask the user to open a new terminal after installation if their chosen
shell requires it.

#### Windows PowerShell

\`\`\`powershell
irm bun.sh/install.ps1 | iex

mkdir saanseoi-project
cd saanseoi-project
# If Vite says the directory is non-empty, select “Ignore files and continue”.
# Never select “Remove existing files.”
# The --no-immediate flag selects “No” for installing and starting now.
bun create vite . --template vanilla-ts --no-immediate
bun install
\`\`\`

### If Bun reports a temporary-directory or sandbox error

Use project-local temporary directories for the installation, then remove them after
it succeeds.

#### Linux or macOS

\`\`\`bash
mkdir -p .bun-tmp .bun-install
BUN_TMPDIR="$PWD/.bun-tmp" ${'\\'}
BUN_INSTALL="$PWD/.bun-install" ${'\\'}
bun install
rm -rf .bun-tmp .bun-install
\`\`\`

#### Windows PowerShell

\`\`\`powershell
New-Item -ItemType Directory -Force .bun-tmp, .bun-install
$env:BUN_TMPDIR = "$PWD\\.bun-tmp"
$env:BUN_INSTALL = "$PWD\\.bun-install"
bun install
Remove-Item -Recurse -Force .bun-tmp, .bun-install
\`\`\`

For an online or embedded map, install exactly one CLI development dependency matching
the selected host after \`bun install\` and before \`bun dev\`. This only adds a local
CLI dependency; it does not sign in, configure an account, or deploy.

\`\`\`bash
# Cloudflare
bun add -d wrangler

# GitHub Pages
bun add -d gh-pages

# Netlify
bun add -d netlify-cli

# Vercel
bun add -d vercel
\`\`\`

Then start the development server:

\`\`\`bash
bun dev
\`\`\`

Keep the development server running. Verify that the local server URL it reports
(normally \`http://localhost:5173/\`) loads the Vite page: check it yourself when you
have browser access; otherwise ask the user to open it and report the result. A
successful Bun command, build, or HTTP response is not visual verification. Once the
Vite page is confirmed, do not add map libraries, basemaps, hosting configuration, or
deployment settings in this section.
`

const linuxStart = projectSetupInstructions.indexOf('#### Linux')
const macosStart = projectSetupInstructions.indexOf('#### macOS')
const windowsStart = projectSetupInstructions.indexOf('#### Windows PowerShell')
const bunFallbackStart = projectSetupInstructions.indexOf(
  '### If Bun reports a temporary-directory or sandbox error',
)
const verificationStart = projectSetupInstructions.indexOf(
  'Keep the development server',
)

const projectSetupIntroduction = projectSetupInstructions.slice(0, linuxStart).trimEnd()
const linuxInstructions = projectSetupInstructions.slice(linuxStart, macosStart).trim()
const macosInstructions = projectSetupInstructions
  .slice(macosStart, windowsStart)
  .trim()
const windowsInstructions = projectSetupInstructions
  .slice(windowsStart, bunFallbackStart)
  .trim()
const verificationInstructions = projectSetupInstructions
  .slice(verificationStart)
  .trim()

type AssistancePrerequisitesInput = {
  assistanceMode?: 'agentic' | 'chat'
  hostingValue?: string
  objective?: string
  operatingSystem?: string
  terminalExperienceValue?: string
}

const createTerminalOpeningInstructions = ({
  operatingSystem,
}: AssistancePrerequisitesInput) => {
  switch (operatingSystem?.toLowerCase()) {
    case 'linux':
      return 'Open the Terminal application from the applications menu. On many Linux desktops, `Ctrl` + `Alt` + `T` opens it; if it does not, search the applications menu for “Terminal”.'
    case 'macos':
      return 'Open Terminal using Spotlight: press `Command` + `Space`, type “Terminal”, then press `Return`.'
    case 'windows':
      return 'Open Windows PowerShell: open Start, search for “PowerShell”, then select Windows PowerShell.'
    default:
      return 'Ask me to open the terminal application for my operating system before continuing.'
  }
}

const createTerminalAssistanceInstructions = ({
  assistanceMode,
  operatingSystem,
  terminalExperienceValue,
}: AssistancePrerequisitesInput) => {
  if (assistanceMode !== 'chat' || terminalExperienceValue !== 'none') return []

  const modeInstructions =
    'Give me one command at a time, explain its expected result, and wait for my response before giving the next command.'

  return [
    [
      '### Starting with the terminal',
      '',
      'I said I have no terminal experience. Briefly explain that the terminal is an application for entering commands to set up and run the project.',
      createTerminalOpeningInstructions({ operatingSystem }),
      modeInstructions,
    ].join('\n'),
  ]
}

const hostingToolByValue = {
  cloudflare: { command: 'bun add -d wrangler', name: 'Wrangler' },
  'github-pages': { command: 'bun add -d gh-pages', name: 'gh-pages' },
  netlify: { command: 'bun add -d netlify-cli', name: 'Netlify CLI' },
  vercel: { command: 'bun add -d vercel', name: 'Vercel CLI' },
} as const

const createBunInstallFallbackInstructions = ({
  operatingSystem,
}: AssistancePrerequisitesInput) => {
  const isWindows = operatingSystem?.toLowerCase() === 'windows'
  const code = isWindows
    ? [
        '```powershell',
        'New-Item -ItemType Directory -Force .bun-tmp, .bun-install',
        '$env:BUN_TMPDIR = "$PWD\\.bun-tmp"',
        '$env:BUN_INSTALL = "$PWD\\.bun-install"',
        'bun install',
        'Remove-Item -Recurse -Force .bun-tmp, .bun-install',
        '```',
      ].join('\n')
    : [
        '```bash',
        'mkdir -p .bun-tmp .bun-install',
        'BUN_TMPDIR="$PWD/.bun-tmp" \\',
        'BUN_INSTALL="$PWD/.bun-install" \\',
        'bun install',
        'rm -rf .bun-tmp .bun-install',
        '```',
      ].join('\n')

  return [
    '#### If Bun reports a temporary-directory or sandbox error',
    '',
    'Run the following in the project directory. It uses workspace-local temporary directories for `bun install`, then removes them after a successful installation.',
    code,
  ].join('\n')
}

const developmentServerInstructions = [
  '#### Start the development server',
  '',
  'After installing the selected host’s CLI dependency when applicable, start the server:',
  '',
  '```bash',
  'bun dev',
  '```',
].join('\n')

const createHostingSetupInstructions = ({
  assistanceMode,
  hostingValue,
  objective,
  operatingSystem,
}: AssistancePrerequisitesInput) => {
  if (objective !== 'web' && objective !== 'web-embed') return []

  const hostingTool = hostingValue
    ? hostingToolByValue[hostingValue as keyof typeof hostingToolByValue]
    : undefined

  if (!hostingTool) return []

  const chatTerminalInstruction =
    assistanceMode === 'chat'
      ? 'Before installing this dependency, ask me to open another terminal tab or window and navigate to the same project directory. Give me the exact command for that terminal, such as `cd saanseoi-project` when it opens in the parent directory.'
      : undefined

  const isWindows = operatingSystem?.toLowerCase() === 'windows'

  return [
    [
      `### Install the ${hostingTool.name} dependency`,
      '',
      ...(chatTerminalInstruction ? [chatTerminalInstruction, ''] : []),
      `In the project directory, install the ${hostingTool.name} development dependency now. This only adds the local CLI dependency: it does not sign in, configure an account, or deploy.`,
      isWindows ? '```powershell' : '```bash',
      hostingTool.command,
      '```',
    ].join('\n'),
  ]
}

const createProjectSetupIntroduction = ({
  objective,
}: AssistancePrerequisitesInput) => {
  switch (objective) {
    case 'local':
      return 'For this local map on my computer, use Bun and TypeScript. Use the appropriate commands in the chosen working directory — in this tutorial, `saanseoi-project`.'
    case 'web':
      return 'For this stand-alone web app, use Bun and TypeScript. Use the appropriate commands in the chosen working directory — in this tutorial, `saanseoi-project`.'
    case 'web-embed':
      return 'For this map embedded in an existing site, first create a standalone web map with Bun and TypeScript. Use the appropriate commands in the chosen working directory — in this tutorial, `saanseoi-project`.'
    default:
      return projectSetupIntroduction
  }
}

const createOperatingSystemSetupInstructions = (
  input: AssistancePrerequisitesInput,
  includeVerification = true,
) => {
  const { operatingSystem } = input
  const introduction = createProjectSetupIntroduction(input)
  const terminalInstructions = createTerminalAssistanceInstructions(input)
  const hostingInstructions = createHostingSetupInstructions(input)

  if (!operatingSystem && input.assistanceMode === 'agentic') {
    return [
      introduction,
      projectSetupSafetyInstructions,
      linuxInstructions,
      createBunInstallFallbackInstructions(input),
      developmentServerInstructions,
      ...hostingInstructions,
      ...(includeVerification ? [verificationInstructions] : []),
    ]
  }

  switch (operatingSystem?.toLowerCase()) {
    case 'linux':
      return [
        introduction,
        projectSetupSafetyInstructions,
        ...terminalInstructions,
        linuxInstructions,
        createBunInstallFallbackInstructions(input),
        developmentServerInstructions,
        ...hostingInstructions,
        ...(includeVerification ? [verificationInstructions] : []),
      ]
    case 'macos':
      return [
        introduction,
        projectSetupSafetyInstructions,
        ...terminalInstructions,
        macosInstructions,
        linuxInstructions.replace('#### Linux', ''),
        createBunInstallFallbackInstructions(input),
        developmentServerInstructions,
        ...hostingInstructions,
        ...(includeVerification ? [verificationInstructions] : []),
      ]
    case 'windows':
      return [
        introduction,
        projectSetupSafetyInstructions,
        ...terminalInstructions,
        windowsInstructions,
        createBunInstallFallbackInstructions(input),
        developmentServerInstructions,
        ...hostingInstructions,
        ...(includeVerification ? [verificationInstructions] : []),
      ]
    default:
      return [
        introduction,
        projectSetupSafetyInstructions,
        ...terminalInstructions,
        linuxInstructions,
        macosInstructions,
        windowsInstructions,
        createBunInstallFallbackInstructions(input),
        developmentServerInstructions,
        ...hostingInstructions,
        ...(includeVerification ? [verificationInstructions] : []),
      ]
  }
}

/** Discovery questions used only by the complete `llms.txt` guide. */
export const createAMapLlmPrerequisiteDiscoveryInstructions = () =>
  discoveryInstructions

/** Setup steps used by both the complete guide and collaborative assistance. */
export const createAMapLlmProjectSetupInstructions = () => projectSetupInstructions

export const createAMapLlmPrerequisitesInstructions = () =>
  [discoveryInstructions, projectSetupInstructions].join('\n\n')

/** Setup instructions without discovery questions for collaborative assistance. */
export const createAMapLlmAssistancePrerequisitesInstructions = (
  input: AssistancePrerequisitesInput = {},
) =>
  [prerequisiteHeading, ...createOperatingSystemSetupInstructions(input)].join('\n\n')

/** Setup commands, without the step and verification headings, for a structured prompt. */
export const createAMapLlmAssistancePrerequisiteInstructions = (
  input: AssistancePrerequisitesInput = {},
) =>
  createOperatingSystemSetupInstructions(input, false)
    .map(instruction =>
      instruction
        .replace('### Starting with the terminal', '#### Starting with the terminal')
        .replace('### Install the ', '#### Install the '),
    )
    .join('\n\n')

export const createAMapLlmAssistancePrerequisiteVerificationInstructions = () =>
  verificationInstructions
