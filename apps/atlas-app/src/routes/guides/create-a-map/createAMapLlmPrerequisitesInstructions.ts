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

Before creating anything, inspect the operating system and shell, check whether Bun is
already installed, and check whether \`saanseoi-project\` already exists in the intended
parent directory. If Bun is installed, do not run its installation command. If
\`saanseoi-project\` exists, stop and ask the user whether it is the intended project;
never overwrite it.

Create the project only as \`/path/to/saanseoi-project\`. After creating it, execute every
remaining setup command with \`/path/to/saanseoi-project\` as the working directory. Confirm
that \`package.json\` is inside that directory before continuing. Do not rely on \`.\` unless
the working directory has just been verified. Running \`bun create vite .\` from a workspace
root creates the app in the wrong place.
`.trim()

const viteCreateCommand =
  'bun create vite . --template vanilla-ts --no-immediate --interactive'

const projectSetupInstructions = `### Create a new web-map project

For a new **on-computer**, **online**, or **site-embed** web map, use Bun and
TypeScript. The project directory in this tutorial is \`/path/to/saanseoi-project\`.

${projectSetupSafetyInstructions}

#### Linux

First check for Bun. Only run the installation command when \`bun --version\` reports that
Bun is unavailable.

\`\`\`bash
# Run this only if Bun is not installed:
curl -fsSL https://bun.sh/install | bash

# Run these only after confirming that saanseoi-project does not already exist.
mkdir saanseoi-project
cd saanseoi-project
pwd
# If Vite says the directory is non-empty, select “Ignore files and continue”.
# Never select “Remove existing files.”
# The --no-immediate flag selects “No” for installing and starting now.
${viteCreateCommand}
bun install
bun add -d wrangler
\`\`\`

#### macOS

Use the Linux command sequence after inspecting the shell. Check \`bun --version\` first;
skip the Bun installation command when it is already installed, and ask the user to open a
new terminal after installation if their chosen shell requires it.

#### Windows PowerShell

First check for Bun with \`Get-Command bun -ErrorAction SilentlyContinue\`. Only run the
installation command when it is unavailable.

\`\`\`powershell
# Run this only if Bun is not installed:
irm bun.sh/install.ps1 | iex

# Run these only after confirming that saanseoi-project does not already exist.
mkdir saanseoi-project
cd saanseoi-project
pwd
# If Vite says the directory is non-empty, select “Ignore files and continue”.
# Never select “Remove existing files.”
# The --no-immediate flag selects “No” for installing and starting now.
bun create vite . --template vanilla-ts --no-immediate --interactive
bun install
bun add -d wrangler
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

Then start the development server:

\`\`\`bash
pwd
# Confirm that this is /path/to/saanseoi-project and that package.json is here.
bun dev -- --host 0.0.0.0
\`\`\`

Keep the development server running. Use the exact URL Vite reports, including an
alternative port such as \`http://localhost:5174/\`; do not assume port 5173 is available,
and do not stop or restart another process using it. Visibly open that reported URL in a
browser and confirm that the default Vite page is displayed. A successful Bun command,
build, or HTTP response is not visual verification. If no browser is available, stop and
ask the user to open the reported URL and describe what they see.

Do not install map libraries or add basemap, style, data, Cloudflare configuration,
credentials, deployment, or embedding settings. Once the user confirms that the default
Vite page is visible, summarise the setup and stop.
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
const developmentServerStart = projectSetupInstructions.indexOf(
  'Then start the development server',
)

const linuxInstructions = projectSetupInstructions.slice(linuxStart, macosStart).trim()
const macosIntroduction = projectSetupInstructions
  .slice(macosStart, windowsStart)
  .trim()
const macosInstructions = [
  macosIntroduction,
  linuxInstructions.replace('#### Linux', '').trim(),
].join('\n\n')
const windowsInstructions = projectSetupInstructions
  .slice(windowsStart, bunFallbackStart)
  .trim()
const bunInstallFallbackInstructions = projectSetupInstructions
  .slice(bunFallbackStart, developmentServerStart)
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
  'Immediately before starting the server, run `pwd` and confirm that it prints `/path/to/saanseoi-project`. Confirm that `package.json` is in that directory. Do not rely on `.` until that check has just succeeded.',
  '',
  '```bash',
  'pwd',
  'bun dev -- --host 0.0.0.0',
  '```',
].join('\n')

const createProjectSetupIntroduction = ({
  objective,
}: AssistancePrerequisitesInput) => {
  switch (objective) {
    case 'local':
      return 'For this local map on my computer, use Bun and TypeScript in `/path/to/saanseoi-project`.'
    case 'web':
      return 'For this stand-alone web app, use Bun and TypeScript in `/path/to/saanseoi-project`.'
    case 'web-embed':
      return 'For this map embedded in an existing site, first create a standalone web map with Bun and TypeScript in `/path/to/saanseoi-project`.'
    default:
      return '### Create a new web-map project\n\nFor a new web map, use Bun and TypeScript in `/path/to/saanseoi-project`.'
  }
}

const createOperatingSystemSetupInstructions = (
  input: AssistancePrerequisitesInput,
  includeVerification = true,
) => {
  const { operatingSystem } = input
  const introduction = createProjectSetupIntroduction(input)
  const terminalInstructions = createTerminalAssistanceInstructions(input)

  if (input.assistanceMode === 'agentic') {
    return [
      introduction,
      projectSetupSafetyInstructions,
      linuxInstructions,
      macosInstructions,
      windowsInstructions,
      bunInstallFallbackInstructions,
      developmentServerInstructions,
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
        ...(includeVerification ? [verificationInstructions] : []),
      ]
    case 'macos':
      return [
        introduction,
        projectSetupSafetyInstructions,
        ...terminalInstructions,
        macosInstructions,
        createBunInstallFallbackInstructions(input),
        developmentServerInstructions,
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
