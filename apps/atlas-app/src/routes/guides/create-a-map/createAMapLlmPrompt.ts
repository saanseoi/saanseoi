import { createAMapLlmAssistanceModeInstructions } from './createAMapLlmModeInstructions'
import { createAMapLlmWorkingAgreementInstructions } from './createAMapLlmOverviewInstructions'
import {
  createAMapLlmAssistancePrerequisiteInstructions,
  createAMapLlmAssistancePrerequisiteVerificationInstructions,
} from './createAMapLlmPrerequisitesInstructions'
import {
  createAMapRendererReferenceInstructions,
  isCreateAMapRenderer,
} from './createAMapRendererReference'

export type CreateAMapLlmPromptSection =
  | 'prerequisites'
  | 'render'
  | 'basemap'
  | 'style'
  | 'data'
  | 'publish'

export type CreateAMapLlmPromptState = {
  agentTool?: string
  agentToolValue?: string
  codeEditor?: string
  dataSource?: string
  dataSourceLabel?: string
  hosting?: string
  hostingValue?: string
  mobileLibrary?: string
  mobilePlatform?: string
  notebookLibrary?: string
  notebookRuntime?: string
  objective?: string
  objectiveLabel?: string
  operatingSystem?: string
  platform?: string
  preferredLocale: string
  region?: string
  regionLabel?: string
  renderer?: string
  rendererLabel?: string
  style?: string
  styleLabel?: string
  styleUrl?: string
  terminalExperience?: string
  terminalExperienceValue?: string
  tilejsonUrl?: string
  vpnAccess?: string
  websitePlatform?: string
}

type PromptMode = 'agentic' | 'chat'

const nextSectionBySection: Partial<
  Record<CreateAMapLlmPromptSection, CreateAMapLlmPromptSection>
> = {
  prerequisites: 'render',
  render: 'basemap',
  basemap: 'style',
  style: 'data',
  data: 'publish',
}

const sectionLabel = (section: CreateAMapLlmPromptSection) =>
  section === 'prerequisites'
    ? 'Prerequisites'
    : section.charAt(0).toUpperCase() + section.slice(1)

const createSectionCompletionInstruction = (section: CreateAMapLlmPromptSection) => {
  const nextSection = nextSectionBySection[section]

  return nextSection
    ? `Once every step in this section has been confirmed, summarise what changed and how you verified it. Then tell me: “The single next action is for you to continue with the “${sectionLabel(nextSection)}” section of the guide. Read it until it provides you with a prompt to share with me again.”`
    : 'Once every step in this section has been confirmed, summarise what changed, how you verified it, and the single next action for me. Confirm that this is the final section of the guide.'
}

const promptValue = (label: string, value?: string) =>
  value ? `- ${label}: ${value}` : undefined

const createSelections = (state: CreateAMapLlmPromptState) =>
  [
    promptValue('AI tool', state.agentTool),
    promptValue('Objective', state.objectiveLabel),
    promptValue('Platform', state.platform),
    promptValue('Operating system', state.operatingSystem),
    promptValue('Terminal experience', state.terminalExperience),
    promptValue('Code editor', state.codeEditor),
    promptValue('VPN access', state.vpnAccess),
    promptValue(
      'Map library',
      state.rendererLabel ?? state.mobileLibrary ?? state.notebookLibrary,
    ),
    promptValue('Basemap coverage', state.regionLabel),
    promptValue('Style', state.styleLabel),
    promptValue('Data source', state.dataSourceLabel),
    promptValue('Hosting', state.hosting),
    promptValue('Website platform', state.websitePlatform),
    promptValue('Mobile platform', state.mobilePlatform),
    promptValue('Notebook runtime', state.notebookRuntime),
  ].filter((line): line is string => Boolean(line))

const createAMapObjectiveSummary = (state: CreateAMapLlmPromptState) => {
  const platform =
    'SaanSeoi (a Hong Kong-based digital commons platform offering geospatial data; site: https://saanseoi.hk)'

  switch (state.objective) {
    case 'local':
      return `We are building a ${platform} digital map that will be available locally on my computer.`
    case 'web':
      return `We are building a ${platform} digital map that will be hosted online as a stand-alone web app.`
    case 'web-embed':
      return `We are building a ${platform} digital map that will be hosted online and embedded in an existing site.`
    case 'mobile-embed':
      return `We are building a ${platform} digital map that will be embedded in a mobile app.`
    case 'notebook-embed':
      return `We are building a ${platform} digital map that will be embedded in a notebook.`
    default:
      return `We are building a ${platform} digital map.`
  }
}

const createAMapPrerequisitesProjectOverview = (state: CreateAMapLlmPromptState) =>
  [
    '## Overall project',
    '',
    createAMapObjectiveSummary(state),
    'The overall goal is a working, accessible map project that achieves this outcome.',
    '',
    'In this first session, help me establish the project foundation only. Do not begin rendering or implementing the map until the setup has been verified.',
  ].join('\n')

const createLocaleInstruction = (preferredLocale: string, subject: string) =>
  preferredLocale === 'en'
    ? undefined
    : `Respond in ${subject} preferred locale (${preferredLocale}) throughout the interaction, even when this prompt or the guide uses another language.`

const optionalInstruction = (instruction?: string) => (instruction ? [instruction] : [])

const createAMapFullHandoverPrompt = (
  state: CreateAMapLlmPromptState,
  guideUrl: string,
  instructionsUrl: string,
  completionInstruction: string,
) =>
  [
    [
      `I am following the “Making a digital map” guide at ${guideUrl}.`,
      'I want you to take full ownership of implementing the SaanSeoi map project as detailed in that guide.',
      `First read the LLM-friendly version at ${instructionsUrl}, then proceed to follow the guide from prerequisites through rendering, basemap, style, data and, where relevant, publishing.`,
      completionInstruction,
    ].join(' '),
    ...optionalInstruction(createLocaleInstruction(state.preferredLocale, 'my')),
    '',
    'The following entries are my supplied project decisions. Treat them as requirements: do not ask again about a listed decision, and use every applicable one when helping me.',
    'Known project decisions:',
    ...createSelections(state),
  ].join('\n')

/** Full hand-over for a coding agent that can work directly in the project. */
export function createAMapAgenticHandoverPrompt(
  state: CreateAMapLlmPromptState,
  guideUrl: string,
  instructionsUrl: string,
) {
  return createAMapFullHandoverPrompt(
    state,
    guideUrl,
    instructionsUrl,
    'Resolve missing decisions by asking concise questions before continuing.',
  )
}

/** Full hand-over for a web chat, which must guide the user through local work. */
export function createAMapChatHandoverPrompt(
  state: CreateAMapLlmPromptState,
  guideUrl: string,
  instructionsUrl: string,
) {
  return createAMapFullHandoverPrompt(
    state,
    guideUrl,
    instructionsUrl,
    'Resolve missing decisions by asking concise questions before continuing, and assist me in performing the required actions on my computer. Always confirm the steps have been completed by describing the expected result and asking me to report what happened if the result differs.',
  )
}

const createSectionInstructions = (
  state: CreateAMapLlmPromptState,
): Record<
  Exclude<CreateAMapLlmPromptSection, 'prerequisites' | 'render'>,
  string[]
> => ({
  basemap: [
    'Integrate the selected SaanSeoi basemap using its public `pk.` key. Place it in the Vite `VITE_SAANSEOI_API_KEY` build variable: it is intentionally embedded in the browser output, so never describe it as a secret or put it in a server-only variable.',
    'Use the public key directly as the `access_token` query parameter on SaanSeoi API and tile requests. Do not add a client token refresh utility, server proxy, or D1 lookup path.',
    'Pause before requesting or using the key. After the user has configured it, verify the selected basemap loads and that no token is logged or committed.',
    ...(state.tilejsonUrl ? [`Use this TileJSON endpoint: ${state.tilejsonUrl}`] : []),
    ...(state.styleUrl
      ? [`Use this selected SaanSeoi style URL: ${state.styleUrl}`]
      : state.style === 'custom'
        ? [
            'The style is custom. Ask for the completed style URL or file before wiring it into the map.',
          ]
        : []),
  ],
  style: [
    state.style === 'custom'
      ? 'Help me create and apply a custom map style. First establish the desired visual direction and the style source or URL; keep it compatible with the selected renderer and SaanSeoi tiles.'
      : 'Apply the selected SaanSeoi map style through the project’s basemap integration, passing the public key to SaanSeoi tile requests and checking that sources and layers render correctly.',
    'Make only the style-related changes in this section and verify them in the running map.',
  ],
  data: [
    state.dataSource === 'api'
      ? 'Build the urban-density example as a reproducible data pipeline: keep source releases and reference years explicit, calculate urban land area and population density defensively, write derived outputs separately, and display both the urban-land overlay and metrics in the map.'
      : 'Ask me for the schema, source and licence of my existing data before integrating it. Then add the smallest robust loading, validation and map-display path for that data.',
    'Keep source data and derived data clearly separated. Do not assume unavailable fields or silently fabricate values.',
  ],
  publish: [
    state.objective === 'mobile-embed'
      ? 'Prepare the selected mobile app for its platform’s build and release workflow. Keep secrets out of the app binary and explain each signing, store-account or release action that needs my involvement.'
      : 'Prepare the project for the selected host. Configure `VITE_SAANSEOI_API_KEY` as a public build-time variable using that host’s environment-variable settings; it must be available to the browser build, but never committed. Build and validate a production artefact first, then stop before authentication, deployment, DNS, or any other external action that needs my account confirmation.',
    ...(state.objective === 'web-embed' && state.websitePlatform !== 'other'
      ? [
          'After a successful deployment, provide an accessible iframe integration for the selected website platform, using the real public URL and a meaningful title.',
        ]
      : []),
  ],
})

const createRenderReferenceInstructions = (state: CreateAMapLlmPromptState) => {
  if (!isCreateAMapRenderer(state.renderer)) return []

  return [
    createAMapRendererReferenceInstructions(state.renderer),
    '',
    'These snippets are for reference only; write the implementation that suits the workspace configuration you found.',
    '',
    '### Verify',
    '',
    'Verify the development server, browser-visible blank map, and any relevant build or type check. If browser access is unavailable, ask me to open the reported local URL and describe the result.',
  ]
}

const createAMapProgressivePrompt = (
  state: CreateAMapLlmPromptState,
  section: CreateAMapLlmPromptSection,
  mode: PromptMode,
) => {
  const isPrerequisites = section === 'prerequisites'
  const localeInstruction = createLocaleInstruction(state.preferredLocale, 'my')
  const projectDecisions = ['### Project decisions', '', ...createSelections(state)]

  if (isPrerequisites) {
    return [
      createAMapPrerequisitesProjectOverview(state),
      '',
      ...projectDecisions,
      '',
      createAMapLlmWorkingAgreementInstructions(mode).replace(
        '## Working agreement',
        '### Working agreement',
      ),
      '',
      ...createAMapLlmAssistanceModeInstructions(mode),
      ...(localeInstruction ? ['', localeInstruction] : []),
      '',
      '## Step 0 : Prerequisites',
      '',
      '### Instructions',
      '',
      createAMapLlmAssistancePrerequisiteInstructions({
        ...state,
        assistanceMode: mode,
      }),
      '',
      '### Verification',
      '',
      createAMapLlmAssistancePrerequisiteVerificationInstructions(),
      '',
      createSectionCompletionInstruction('prerequisites'),
    ].join('\n')
  }

  return [
    `## ${sectionLabel(section)} Section`,
    '',
    `Continue the “${sectionLabel(section)}” section of my SaanSeoi map project.`,
    ...(section === 'render'
      ? [
          '',
          'If you have no context for the SaanSeoi project, stop immediately and tell me that I am likely in the wrong thread or should paste the project context again.',
        ]
      : []),
    '',
    ...createAMapLlmAssistanceModeInstructions(mode),
    ...(localeInstruction ? ['', localeInstruction] : []),
    '',
    ...(section === 'render'
      ? createRenderReferenceInstructions(state)
      : [
          'The following entries are the user’s supplied project decisions. Treat them as requirements: do not ask again about a listed decision, and use every applicable one when completing this section.',
          ...projectDecisions,
          '',
          'This section:',
          ...createSectionInstructions(state)[section].map(
            instruction => `- ${instruction}`,
          ),
        ]),
    '',
    createSectionCompletionInstruction(section),
  ].join('\n')
}

/** Progressive hand-off for a coding agent as the reader advances through the guide. */
export const createAMapAgenticSectionPrompt = (
  state: CreateAMapLlmPromptState,
  section: CreateAMapLlmPromptSection,
) => createAMapProgressivePrompt(state, section, 'agentic')

/** Progressive hand-off for a web chat as the reader advances through the guide. */
export const createAMapChatSectionPrompt = (
  state: CreateAMapLlmPromptState,
  section: CreateAMapLlmPromptSection,
) => createAMapProgressivePrompt(state, section, 'chat')
