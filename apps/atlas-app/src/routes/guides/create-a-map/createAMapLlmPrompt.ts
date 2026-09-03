import { m } from '@repo/i18n/messages'
import {
  getCreateAMapOpeningPosition,
  type CreateAMapSelectionQuery,
} from '#lib/guides/createAMapSelections.js'

import { createAMapLlmAssistanceModeInstructions } from './createAMapLlmModeInstructions'
import {
  createAMapLlmAssistancePrerequisiteInstructions,
  createAMapLlmAssistancePrerequisiteVerificationInstructions,
} from './createAMapLlmPrerequisitesInstructions'
import {
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  getCreateAMapRendererReference,
  isCreateAMapRenderer,
} from './snippets'

export type CreateAMapLlmPromptSection =
  | 'prerequisites'
  | 'render'
  | 'basemap'
  | 'style'
  | 'data'
  | 'publish'

export type CreateAMapDataPromptStep =
  | 'fetchStats'
  | 'calculateDensity'
  | 'addStatsToMap'
  | 'findUnliveableLand'
  | 'calculateLiveableArea'
  | 'finaliseMap'

export type CreateAMapLlmPromptState = {
  agentTool?: string
  agentToolValue?: string
  basemapApiKey?: string
  codeEditor?: string
  codeEditorValue?: string
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
  operatingSystemValue?: string
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

export type PromptLlmType = 'all' | 'agent' | 'chat'

export type CreateAMapLlmPromptFragment = {
  llmType: PromptLlmType
  os: 'all' | string
  editor: 'all' | string
  terminalExperience: 'all' | string
  text: string
}

const agentCapableEditors = ['zed', 'cursor'] as const

export function isCreateAMapAgentCapableEditor(
  editor?: string,
): editor is (typeof agentCapableEditors)[number] {
  return agentCapableEditors.includes(editor as (typeof agentCapableEditors)[number])
}

export function shouldShowCreateAMapEditorSetup({
  editorValue,
  llmType,
}: {
  editorValue?: string
  llmType: Exclude<PromptLlmType, 'all'>
}) {
  return llmType === 'chat' || isCreateAMapAgentCapableEditor(editorValue)
}

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
  if (section === 'prerequisites') {
    return 'Once the user confirms that the default Vite page is visibly displayed, summarise the setup and stop. Do not make further changes or begin the “Render your map” section.'
  }

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

const createLocaleInstruction = (preferredLocale: string, subject: string) =>
  preferredLocale === 'en'
    ? undefined
    : `Respond in ${subject} preferred locale (${preferredLocale}) throughout the interaction, even when this prompt or the guide uses another language.`

const optionalInstruction = (instruction?: string) => (instruction ? [instruction] : [])

const promptDecision = (value?: string) => value ?? 'TBD'

const createProjectSetupUseCase = (objective?: string) => {
  switch (objective) {
    case 'local':
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_local()
    case 'web':
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_web()
    case 'web-embed':
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_web_embed()
    case 'mobile-embed':
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_mobile_embed()
    case 'notebook-embed':
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_notebook_embed()
    default:
      return m.llm_prompt_guide_create_a_map_project_setup_use_case_tbd()
  }
}

const matchesPromptFragment = (expected: string, actual: string | undefined) =>
  expected === 'all' || expected === actual

/**
 * Prompt prose is kept as ordered, localised fragments. The filter fields make
 * workspace-specific additions possible without duplicating the shared prompt.
 */
export function createAMapProjectSetupPromptFragments(
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
): CreateAMapLlmPromptFragment[] {
  const llmType: Exclude<PromptLlmType, 'all'> = mode === 'agentic' ? 'agent' : 'chat'
  const fragments: CreateAMapLlmPromptFragment[] = [
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_overall_project({
        guideUrl: 'https://saanseoi.hk/guides/create-a-map',
        useCase: createProjectSetupUseCase(state.objective),
      }),
    },
    {
      llmType: 'agent',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_agent_mode(),
    },
    {
      llmType: 'chat',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_chat_mode(),
    },
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_first_session(),
    },
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_project_decisions({
        aiTool: promptDecision(state.agentTool),
        objective: promptDecision(state.objectiveLabel),
        platform: promptDecision(state.platform),
        terminalExperience: promptDecision(state.terminalExperience),
        codeEditor: promptDecision(state.codeEditor),
        vpnAccess: promptDecision(state.vpnAccess),
        mapLibrary: promptDecision(
          state.rendererLabel ?? state.mobileLibrary ?? state.notebookLibrary,
        ),
        basemapCoverage: promptDecision(state.regionLabel),
        style: promptDecision(state.styleLabel),
        dataSource: promptDecision(state.dataSourceLabel),
        hosting: promptDecision(state.hosting),
        websitePlatform: promptDecision(state.websitePlatform),
      }),
    },
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_working_agreement(),
    },
    {
      llmType: 'chat',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_chat_actions(),
    },
    {
      llmType: 'agent',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_agent_actions(),
    },
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_collaborative_assistance(),
    },
  ]

  const setupInstructions = createAMapLlmAssistancePrerequisiteInstructions({
    assistanceMode: mode,
    hostingValue: state.hostingValue,
    objective: state.objective,
    operatingSystem: state.operatingSystem,
    terminalExperienceValue: state.terminalExperienceValue,
  })
  fragments.push({
    llmType: 'all',
    os: state.operatingSystemValue ?? 'all',
    editor: state.codeEditorValue ?? 'all',
    terminalExperience: state.terminalExperienceValue ?? 'all',
    text: [
      m.llm_prompt_guide_create_a_map_project_setup_instructions_heading(),
      m.llm_prompt_guide_create_a_map_project_setup_instructions_subheading(),
      setupInstructions,
      m.llm_prompt_guide_create_a_map_project_setup_verification_heading(),
      createAMapLlmAssistancePrerequisiteVerificationInstructions(),
    ].join('\n\n'),
  })

  return fragments.filter(
    fragment =>
      (fragment.llmType === 'all' || fragment.llmType === llmType) &&
      matchesPromptFragment(fragment.os, state.operatingSystemValue) &&
      matchesPromptFragment(fragment.editor, state.codeEditorValue) &&
      matchesPromptFragment(fragment.terminalExperience, state.terminalExperienceValue),
  )
}

const createAMapProjectSetupPrompt = (
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
) => {
  const fragments = createAMapProjectSetupPromptFragments(state, mode)

  return [...fragments.map(fragment => fragment.text)].join('\n\n')
}

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
  Exclude<CreateAMapLlmPromptSection, 'prerequisites' | 'render' | 'basemap'>,
  string[]
> => ({
  style: [
    state.style === 'custom'
      ? 'Help me create and apply a custom map style. First establish the desired visual direction and the style source or URL; keep it compatible with the selected renderer and SaanSeoi tiles.'
      : 'Apply the selected SaanSeoi map style through the project’s basemap integration, passing the public key to SaanSeoi tile requests and checking that sources and layers render correctly.',
    ...createStyleReferenceInstructions(state),
    'Make only the style-related changes in this section and verify them in the running map.',
  ],
  data: [
    state.dataSource === 'api'
      ? 'Use the configured public SaanSeoi API key to request the 2024 `populationMidYear` and `landArea` values from `/stats/v0.1/geographies`, then present the returned District data in a readable table for inspection. Keep source releases and reference years explicit, calculate defensively, and keep source data separate from derived data.'
      : 'Ask me for the schema, source and licence of my existing data before integrating it. Then add the smallest robust loading, validation and map-display path for that data.',
    'Do not assume unavailable fields or silently fabricate values.',
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

const dataStepDetails: Record<
  CreateAMapDataPromptStep,
  { heading: string; label: string; next?: string; instructions: string[] }
> = {
  fetchStats: {
    heading: 'Data Section',
    label: 'Fetch population density statistics',
    next: 'Calculate population density',
    instructions: [
      'Use the configured public SaanSeoi API key to request the 2024 `populationMidYear` and `landArea` values from `/stats/v0.1/geographies`.',
      'Present the returned District data in a readable table so I can inspect exactly what the API returned.',
      'Do not calculate Area-level density or add map overlays in this step; those belong to the following steps.',
    ],
  },
  calculateDensity: {
    heading: 'Calculate population density',
    label: 'Calculate population density',
    next: 'Put the stats on the map',
    instructions: [
      'Use the fetched District statistics and the divisions hierarchy to group the population and published land area by Area.',
      'Calculate each Area’s population density defensively and keep the derived metrics separate from the source responses.',
      'Do not add the metrics to the map yet; that is the next step.',
    ],
  },
  addStatsToMap: {
    heading: 'Put the stats on the map',
    label: 'Put the stats on the map',
    next: 'Identifying land without human habitats',
    instructions: [
      'Add the calculated Area metrics to the map as the three summary cards and the supporting controls and legend.',
      'Use the CSS and TypeScript references supplied with this prompt, and colour each Area label to match its District overlay colour.',
      'Verify the cards and Area-coloured Districts in the running map before stopping.',
    ],
  },
  findUnliveableLand: {
    heading: 'Identifying land without human habitats',
    label: 'Identifying land without human habitats',
    next: 'Calculate liveable area',
    instructions: [
      'Use the SaanSeoi basemap land-use data to show which land will be excluded from the density denominator.',
      'Keep this step focused on the exclusion highlighter. Do not begin the tile download, geometry Worker, or saved-result analysis yet.',
    ],
  },
  calculateLiveableArea: {
    heading: 'Calculate liveable area',
    label: 'Calculate liveable area',
    next: 'Finalise map',
    instructions: [
      'Implement the complete one-time land analysis using the supplied references: install the geospatial packages, add the geometry Worker, fetch and process z14 tiles, show progress, and save the compressed `land-analysis.json.gz` result.',
      'Use the existing project and configured public API key. Keep the analysis in the browser and verify that the simulated progress and final download flow are understandable to the user.',
    ],
  },
  finaliseMap: {
    heading: 'Finalise map',
    label: 'Finalise map',
    instructions: [
      'Load the cached `land-analysis.json.gz` result, aggregate each District’s excluded land by Area, and calculate the revised population density using the remaining liveable land.',
      'Replace the basemap-based land-exclusion highlighter with the saved District layers and revised Area density, so the map uses the cached result instead of repeating the tile calculation.',
      'Use both supplied TypeScript references and verify the final map and conclusion data in the browser.',
    ],
  },
}

const createDataStepModeInstruction = (mode: PromptMode) =>
  mode === 'agentic'
    ? 'As a coding agent, make only the changes for this step in the existing project. Use the supplied references as implementation guidance, verify the running map, and stop when this step is complete.'
    : 'As a web chat, guide me through this step one action at a time. Name the exact file or terminal target, tell me whether to create, replace, or append, wait for my confirmation, and stop when this step is complete.'

export const createAMapDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
  mode: PromptMode,
) => {
  const details = dataStepDetails[step]
  const localeInstruction = createLocaleInstruction(state.preferredLocale, 'my')
  const nextInstruction = details.next
    ? `Once this step is verified, summarise what changed and tell me: “The single next action is for you to continue with the “${details.next}” section of the guide. Read it until it provides you with a prompt to share with me again.”`
    : 'Once this final step is verified, summarise what changed, how you verified it, and the single next action for me.'

  const newDecisionLines =
    step === 'fetchStats'
      ? [
          '',
          '### Project decisions',
          '',
          `- Data source: ${state.dataSourceLabel ?? 'SaanSeoi Statistics API'}`,
        ]
      : []

  return [
    `## ${details.heading}`,
    '',
    `Continue the “${details.label}” section of my SaanSeoi map project.`,
    '',
    createDataStepModeInstruction(mode),
    ...(localeInstruction ? ['', localeInstruction] : []),
    ...newDecisionLines,
    '',
    'This step:',
    ...details.instructions.map(instruction => `- ${instruction}`),
    '',
    nextInstruction,
  ].join('\n')
}

export const createAMapAgenticDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
) => createAMapDataStepPrompt(state, step, 'agentic')

export const createAMapChatDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
) => createAMapDataStepPrompt(state, step, 'chat')

const createStyleReferenceInstructions = (state: CreateAMapLlmPromptState) => {
  if (!isCreateAMapRenderer(state.renderer) || !state.styleUrl || !state.tilejsonUrl) {
    return []
  }

  const reference = getCreateAMapRendererReference(state.renderer)

  return [
    `The selected renderer is ${reference.label}. Use its existing project setup and apply the selected style with the following renderer-specific changes:`,
    '',
    '```ts',
    createAMapRendererStyleCode(state.renderer, state.styleUrl, state.tilejsonUrl),
    '```',
    '',
    'Adapt the snippet to the project’s actual file structure, preserving the selected renderer and its existing setup. Do not expose or log the public key.',
  ]
}

const createAMapStylePrompt = (state: CreateAMapLlmPromptState) =>
  [
    '## Style Section',
    '',
    'Complete only the “Pick your styles” section of my SaanSeoi map project.',
    '',
    ...(state.rendererLabel
      ? [`- Selected mapping library: ${state.rendererLabel}`]
      : []),
    ...(state.styleLabel ? [`- Selected style: ${state.styleLabel}`] : []),
    '',
    ...createSectionInstructions(state).style.map(instruction => `- ${instruction}`),
  ].join('\n')

const createPromptRegion = (region?: string): CreateAMapSelectionQuery['region'] =>
  region === 'hk' || region === 'mo' || region === 'gba' ? region : undefined

const createRenderReferenceInstructions = (state: CreateAMapLlmPromptState) => {
  if (!isCreateAMapRenderer(state.renderer)) return []

  const reference = getCreateAMapRendererReference(
    state.renderer,
    getCreateAMapOpeningPosition(createPromptRegion(state.region)),
  )
  const isWindows = state.operatingSystemValue === 'windows'
  const shell = isWindows ? 'powershell' : 'bash'
  const mainPath = isWindows ? 'src\\main.ts' : 'src/main.ts'
  const stylesheetPath = isWindows ? 'src\\style.css' : 'src/style.css'
  const library = state.rendererLabel ?? reference.label

  return [
    ...(state.renderer === 'mapbox'
      ? [m.llm_prompt_guide_create_a_map_render_mapbox_token()]
      : []),
    m.llm_prompt_guide_create_a_map_render_setup({
      command: reference.installCommand,
      library,
      shell,
    }),
    m.llm_prompt_guide_create_a_map_render_code_edits({
      mainPath,
    }),
    '```ts',
    reference.code,
    '```',
    m.llm_prompt_guide_create_a_map_render_stylesheet_edit({ stylesheetPath }),
    '```css',
    reference.stylesheetCode,
    '```',
    m.llm_prompt_guide_create_a_map_render_verify(),
  ]
}

export function createAMapRenderPromptFragments(
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
): CreateAMapLlmPromptFragment[] {
  if (!isCreateAMapRenderer(state.renderer)) return []

  const llmType: Exclude<PromptLlmType, 'all'> = mode === 'agentic' ? 'agent' : 'chat'
  const reference = getCreateAMapRendererReference(
    state.renderer,
    getCreateAMapOpeningPosition(createPromptRegion(state.region)),
  )
  const fragments: CreateAMapLlmPromptFragment[] = [
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_render_context({
        library: state.rendererLabel ?? reference.label,
      }),
    },
    {
      llmType: 'chat',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_chat_mode(),
    },
    {
      llmType: 'chat',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_render_chat_actions(),
    },
    {
      llmType: 'chat',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_project_setup_collaborative_assistance(),
    },
    {
      llmType: 'all',
      os: state.operatingSystemValue ?? 'all',
      editor: state.codeEditorValue ?? 'all',
      terminalExperience: state.terminalExperienceValue ?? 'all',
      text: createRenderReferenceInstructions(state).join('\n\n'),
    },
  ]

  return fragments.filter(
    fragment =>
      (fragment.llmType === 'all' || fragment.llmType === llmType) &&
      matchesPromptFragment(fragment.os, state.operatingSystemValue) &&
      matchesPromptFragment(fragment.editor, state.codeEditorValue) &&
      matchesPromptFragment(fragment.terminalExperience, state.terminalExperienceValue),
  )
}

const createAMapRenderPrompt = (state: CreateAMapLlmPromptState, mode: PromptMode) =>
  createAMapRenderPromptFragments(state, mode)
    .map(fragment => fragment.text)
    .join('\n\n')

const createBasemapReferenceInstructions = (state: CreateAMapLlmPromptState) => {
  if (!isCreateAMapRenderer(state.renderer) || !state.tilejsonUrl) return []

  const path = state.operatingSystemValue === 'windows' ? 'src\\main.ts' : 'src/main.ts'

  return [
    m.llm_prompt_guide_create_a_map_basemap_code_edits({ path }),
    '```ts',
    createAMapRendererBasemapCode(
      state.renderer,
      state.styleUrl ?? '',
      state.tilejsonUrl,
      getCreateAMapOpeningPosition(createPromptRegion(state.region)),
    ),
    '```',
  ]
}

export function createAMapBasemapPromptFragments(
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
): CreateAMapLlmPromptFragment[] {
  const llmType: Exclude<PromptLlmType, 'all'> = mode === 'agentic' ? 'agent' : 'chat'
  const fragments: CreateAMapLlmPromptFragment[] = [
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_basemap_context({
        apiKey: state.basemapApiKey ?? 'TBD',
        library: state.rendererLabel ?? 'TBD',
        tilejsonUrl: state.tilejsonUrl ?? 'TBD',
      }),
    },
    {
      llmType: 'all',
      os: state.operatingSystemValue ?? 'all',
      editor: state.codeEditorValue ?? 'all',
      terminalExperience: state.terminalExperienceValue ?? 'all',
      text: createBasemapReferenceInstructions(state).join('\n\n'),
    },
    {
      llmType: 'all',
      os: 'all',
      editor: 'all',
      terminalExperience: 'all',
      text: m.llm_prompt_guide_create_a_map_basemap_verify(),
    },
  ]

  return fragments.filter(
    fragment =>
      (fragment.llmType === 'all' || fragment.llmType === llmType) &&
      matchesPromptFragment(fragment.os, state.operatingSystemValue) &&
      matchesPromptFragment(fragment.editor, state.codeEditorValue) &&
      matchesPromptFragment(fragment.terminalExperience, state.terminalExperienceValue),
  )
}

const createAMapBasemapPrompt = (state: CreateAMapLlmPromptState, mode: PromptMode) =>
  createAMapBasemapPromptFragments(state, mode)
    .map(fragment => fragment.text)
    .filter(Boolean)
    .join('\n\n')

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
      createAMapProjectSetupPrompt(state, mode),
      ...(localeInstruction ? [localeInstruction] : []),
      createSectionCompletionInstruction('prerequisites'),
    ].join('\n\n')
  }

  if (section === 'render') {
    return [
      createAMapRenderPrompt(state, mode),
      ...(localeInstruction ? [localeInstruction] : []),
      createSectionCompletionInstruction(section),
    ].join('\n\n')
  }

  if (section === 'basemap') {
    return [
      createAMapBasemapPrompt(state, mode),
      ...(localeInstruction ? [localeInstruction] : []),
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  if (section === 'style') {
    return createAMapStylePrompt(state)
  }

  if (section === 'data') {
    return createAMapDataStepPrompt(state, 'fetchStats', mode)
  }

  return [
    `## ${sectionLabel(section)} Section`,
    '',
    `Continue the “${sectionLabel(section)}” section of my SaanSeoi map project.`,
    '',
    ...createAMapLlmAssistanceModeInstructions(mode),
    ...(localeInstruction ? ['', localeInstruction] : []),
    '',
    'The following entries are the user’s supplied project decisions. Treat them as requirements: do not ask again about a listed decision, and use every applicable one when completing this section.',
    ...projectDecisions,
    '',
    'This section:',
    ...createSectionInstructions(state)[section].map(instruction => `- ${instruction}`),
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
