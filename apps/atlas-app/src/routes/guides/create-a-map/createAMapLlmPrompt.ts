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

export type CreateAMapDataPromptReference = {
  code: string
  language: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  path: string
  title: string
  type: 'CLI' | 'CSS' | 'TS'
}

export type CreateAMapDataPromptReferences = Partial<
  Record<CreateAMapDataPromptStep, CreateAMapDataPromptReference[]>
>

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

const missingProjectContextInstruction =
  'If you have no context for the SaanSeoi project, stop immediately and tell me that I am likely in the wrong thread or should paste the project context again.'

const createSelections = (state: CreateAMapLlmPromptState) =>
  [
    promptValue('AI tool', state.agentTool),
    promptValue('Operating system', state.operatingSystem),
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
        operatingSystem: promptDecision(state.operatingSystem),
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
      : 'Use every displayed implementation reference in order: install the host CLI, authenticate with the host, create or link the host project, then deploy the built site and report the stable public URL. Configure `VITE_SAANSEOI_API_KEY` as a public build-time variable using the host’s settings; it must be available to the browser build, but never committed.',
    'Before publishing, run a production build and smoke-test its output with a local preview. Confirm that the map, basemap, overlays, statistic cards, and assets work before sending the files to the host.',
    'Explain any account confirmation or paid-plan choice before it happens, then guide the authentication and deployment rather than stopping at prepared local files. Clearly identify the stable public link that people can share, and help me open it in an incognito/private window to confirm it works without my account.',
    state.hostingValue === 'github-pages'
      ? 'For later changes, tell me to start a new project-context thread. If I use chat, I should attach `src/main.ts`, `src/land-analysis.worker.ts`, and `src/style.css`; after changes I must run `git add .`, commit, push, then run the displayed GitHub Pages build-and-publish command so the public site updates.'
      : 'For later changes, tell me to start a new project-context thread. If I use chat, I should attach `src/main.ts`, `src/land-analysis.worker.ts`, and `src/style.css`; after changes I must run the displayed build-and-publish command for the selected host so the public site updates.',
    ...(state.objective === 'web-embed' && state.websitePlatform !== 'other'
      ? [
          'After a successful deployment, provide an accessible iframe integration for the selected website platform, using the real public URL and a meaningful title.',
        ]
      : []),
  ],
})

const dataStepDetails: Record<
  CreateAMapDataPromptStep,
  { heading: string; next?: string; instructions: string[] }
> = {
  fetchStats: {
    heading: 'Data Section',
    next: 'Calculate population density',
    instructions: [
      'Use the configured public SaanSeoi API key to request the 2024 `populationMidYear` and `landArea` values from `/stats/v0.1/geographies`.',
      'Present the returned District data in a readable table so I can inspect exactly what the API returned.',
      'Do not calculate Area-level density or add map overlays in this step; those belong to the following steps.',
    ],
  },
  calculateDensity: {
    heading: 'Calculate population density',
    next: 'Put the stats on the map',
    instructions: [
      'Use the fetched District statistics and the divisions hierarchy to group the population and published land area by Area.',
      'Calculate each Area’s population density defensively and keep the derived metrics separate from the source responses.',
      'Do not add the metrics to the map yet; that is the next step.',
    ],
  },
  addStatsToMap: {
    heading: 'Put the stats on the map',
    next: 'Identifying land without human habitats',
    instructions: [
      'Add the calculated Area metrics to the map as the three summary cards and the supporting controls and legend.',
      'Use the CSS and TypeScript references shown in this card, and colour each Area label to match its District overlay colour.',
      'Verify the cards and Area-coloured Districts in the running map before stopping.',
    ],
  },
  findUnliveableLand: {
    heading: 'Identifying land without human habitats',
    next: 'Calculate liveable area',
    instructions: [
      'Use the SaanSeoi basemap land-use data to show which land will be excluded from the density denominator.',
      'Keep this step focused on the exclusion highlighter. Do not begin the tile download, geometry Worker, or saved-result analysis yet.',
    ],
  },
  calculateLiveableArea: {
    heading: 'Calculate liveable area',
    next: 'Finalise map',
    instructions: [
      'Start by explaining why this is a separate, one-time calculation: the map must turn land-use polygons from many z14 tiles into District-level exclusions, then save the expensive result so visitors do not repeat it.',
      'Offer the prepared result before the calculation: instruct me to download `land-analysis.json.gz` from the guide and place it at `src/land-analysis.json.gz`. It lets the final map load the same analysed result without downloading tiles or running geometry work again.',
      'If the file is not present, implement the complete browser analysis in this order: install the geospatial packages, create the geometry Worker, add the result styles, then make one consolidated `src/main.ts` edit that fetches tiles, tracks progress, analyses District exclusions, and offers the compressed download.',
      'For chat, stop after I report that the downloaded file is at the required path and confirm that with me before moving to Finalise map. For an agent, inspect for the file; if it is elsewhere, move it to `src/land-analysis.json.gz`, and skip the calculation-only code when the cached result is available.',
      'Use the existing project and configured public API key. Keep the analysis in the browser, explain what each file does for the user, and invite me to inspect the completed result and download action in the browser.',
    ],
  },
  finaliseMap: {
    heading: 'Finalise map',
    instructions: [
      'First confirm that `src/land-analysis.json.gz` exists. For an agent, find it and move it there if necessary; when it is available, skip all calculation-only code.',
      'Make one consolidated `src/main.ts` modification that loads the cached result, aggregates each District’s excluded land by Area, calculates revised population density from remaining liveable land, and replaces the earlier basemap exclusion highlighter with the saved District layers, overlays, and statistic cards.',
      'Verify the final overlays and all three statistic cards in the browser. Congratulate me on completing the guide; if my objective includes publishing, direct me to Publish the map, otherwise invite me to ask for any changes I would like to make to the map.',
    ],
  },
}

const promptCodeLanguage = (language: CreateAMapDataPromptReference['language']) =>
  language === 'typescript' ? 'ts' : language

const createChatReferenceInstruction = (reference: CreateAMapDataPromptReference) => {
  if (reference.language === 'bash') {
    return `In the terminal at \`${reference.path}\`, run this command and wait for it to finish before continuing.`
  }

  if (reference.language === 'text') {
    return `In the terminal at \`${reference.path}\`, compare the result with this expected output before continuing.`
  }

  if (reference.path.endsWith('.worker.ts')) {
    return `Create \`${reference.path}\` with this code, then save the file before continuing.`
  }

  return `Open \`${reference.path}\`, go to the end of its existing code, append this code, then save the file before continuing.`
}

const createDataStepReferences = (
  mode: PromptMode,
  references: CreateAMapDataPromptReference[],
) => {
  if (references.length === 0) return []

  return [
    '### Implementation references',
    '',
    mode === 'agentic'
      ? 'Apply the following references to their named targets in the displayed order. They are the source of truth for this step; preserve the working project setup around them.'
      : 'Work through the following references in the displayed order. Follow the target-specific instruction before each snippet; the references are the source of truth for this step.',
    '',
    ...references.flatMap(reference => [
      `#### ${reference.title}`,
      '',
      `Target: \`${reference.path}\``,
      '',
      ...(mode === 'chat' ? [createChatReferenceInstruction(reference), ''] : []),
      `\`\`\`${promptCodeLanguage(reference.language)}`,
      reference.code,
      '```',
      '',
    ]),
  ]
}

const createExistingDataCompletionInstruction = (state: CreateAMapLlmPromptState) =>
  state.objective === 'web' || state.objective === 'web-embed'
    ? 'Once the data is visibly verified, summarise what changed and how you verified it. Then tell me: “The single next action is for you to continue with the “Publish the map” section of the guide. Read it until it provides you with a prompt to share with me again.”'
    : 'Once the data is visibly verified, summarise what changed and how you verified it. Remain available for further map edits.'

/** Progressive prompt for adding an existing GeoJSON file to the map project. */
export const createAMapExistingDataPrompt = (
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
  references: CreateAMapDataPromptReference[] = [],
) => {
  const publicDirectory =
    state.operatingSystemValue === 'windows'
      ? 'C:\\Users\\YourName\\saanseoi-project\\public'
      : '~/saanseoi-project/public'
  const mainPath =
    state.operatingSystemValue === 'windows' ? 'src\\main.ts' : 'src/main.ts'
  const localeInstruction = createLocaleInstruction(state.preferredLocale, 'my')
  const modeInstructions =
    mode === 'agentic'
      ? [
          'Inspect the existing project before changing it.',
          `Confirm that \`features.geojson\` is available. If it is elsewhere, move or copy it to \`${publicDirectory}/features.geojson\` while preserving its contents. If it is missing, stop and ask me to provide it; do not invent or silently rewrite data.`,
          `Open \`${mainPath}\` and add the GeoJSON loading code in the appropriate place in the existing map setup. Preserve the working renderer, basemap and style, adapting only what is needed for the actual project.`,
        ]
      : [
          'Guide me through one safe action at a time and wait for my answer before continuing.',
          `Ask me to put \`features.geojson\` in the project’s \`public\` folder at \`${publicDirectory}\`, then ask me to confirm that the file is there. If I do not have the file, stop and ask me to provide it; do not invent or silently rewrite data.`,
          `Tell me to open \`${mainPath}\`, go to the end of the existing map setup, append the GeoJSON loading code below, and save the file. Do not ask me to replace the working map setup.`,
        ]

  return [
    '## Add GeoJSON to your map',
    '',
    'Continue the “Add your data” section of my SaanSeoi map project.',
    '',
    missingProjectContextInstruction,
    ...(localeInstruction ? ['', localeInstruction] : []),
    '',
    '### Scope',
    '',
    'I am bringing my own data. The data-preparation step has produced a `features.geojson` file for this map.',
    ...modeInstructions.map(instruction => `- ${instruction}`),
    '- Keep this step focused on adding the existing GeoJSON data. Do not start publishing or make unrelated changes.',
    '',
    ...createDataStepReferences(mode, references),
    '### Verify',
    '',
    'Open the running map in a browser and verify that the features appear in the right places. Click a marker and confirm that its name appears as expected. If the result differs, explain what to check and ask me to report what I see.',
    '',
    createExistingDataCompletionInstruction(state),
  ].join('\n')
}

const urbanDensityWorkedExampleDecision =
  'User has opted to follow a worked example where we will be building a population density map for Hong Kong.'

export const createAMapDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
  mode: PromptMode,
  references: CreateAMapDataPromptReference[] = [],
  includeProjectDecision = true,
) => {
  const details = dataStepDetails[step]
  const localeInstruction = createLocaleInstruction(state.preferredLocale, 'my')
  const nextInstruction = details.next
    ? `Once this step is verified, summarise what changed and how you verified it. Then tell me: “The single next action is for you to continue with the “${details.next}” section of the guide. Read it until it provides you with a prompt to share with me again.”`
    : state.objective === 'web' || state.objective === 'web-embed'
      ? 'Once this final step is verified, summarise what changed and how you verified it. Congratulate me on completing the guide, then tell me: “The single next action is for you to continue with the “Publish the map” section of the guide. Read it until it provides you with a prompt to share with me again.” Remain available for any other map changes I would like to make.'
      : 'Once this final step is verified, summarise what changed and how you verified it. Congratulate me on completing the guide and remain available for any other map changes I would like to make.'

  return [
    `## ${details.heading}`,
    '',
    `Continue the “${details.heading}” section of my SaanSeoi map project.`,
    '',
    missingProjectContextInstruction,
    ...(localeInstruction ? ['', localeInstruction] : []),
    ...(step === 'fetchStats' && includeProjectDecision
      ? [
          '',
          '### Project decisions',
          '',
          `- Data source: ${urbanDensityWorkedExampleDecision}`,
        ]
      : []),
    '',
    '### Scope',

    'This step:',
    ...details.instructions.map(instruction => `- ${instruction}`),
    '',
    ...createDataStepReferences(mode, references),
    nextInstruction,
  ].join('\n')
}

export const createAMapAgenticDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
  references?: CreateAMapDataPromptReference[],
) => createAMapDataStepPrompt(state, step, 'agentic', references)

export const createAMapChatDataStepPrompt = (
  state: CreateAMapLlmPromptState,
  step: CreateAMapDataPromptStep,
  references?: CreateAMapDataPromptReference[],
) => createAMapDataStepPrompt(state, step, 'chat', references)

/** Progressive prompt for a reader who wants the LLM to shape a new GeoJSON dataset. */
export const createAMapCustomDataPrompt = (
  state: CreateAMapLlmPromptState,
  mode: PromptMode,
) => {
  const region = state.regionLabel ?? 'selected SaanSeoi basemap coverage'
  const assetSizeInstruction =
    mode === 'agentic'
      ? 'When the GeoJSON asset exists, inspect its actual size yourself, compare it with the applicable limit, and explain a safe alternative such as simplification, splitting, tiling, or hosted data before adding an oversized file.'
      : 'Ask me for the GeoJSON asset’s actual size, compare it with the applicable limit, and explain a safe alternative such as simplification, splitting, tiling, or hosted data before adding an oversized file.'
  const deploymentInstructions = state.hosting
    ? [
        '',
        '### Prepare for selected hosting',
        '',
        `I selected ${state.hosting} for hosting. Look up its current static-asset size limits. ${assetSizeInstruction} Then build, smoke-test, and prepare the map for ${state.hosting} without exposing private credentials.`,
      ]
    : []
  const completionInstruction = state.hosting
    ? `Once the data layer is visibly verified, summarise what changed, how you verified it, and whether the project is ready to publish to ${state.hosting}. Remain available for further map edits.`
    : 'Once the data layer is visibly verified, summarise what changed and how you verified it. Remain available for further map edits.'
  const interaction =
    mode === 'agentic'
      ? 'Inspect the project first, then make the smallest appropriate changes once I have answered. Do not invent features, coordinates, licences, or data values.'
      : 'Guide me one small action at a time and wait for my answer before giving the next action. Tell me exactly which file or terminal command I should use.'

  return [
    '## Craft a custom map',
    '',
    'Continue the “Craft a custom map” section of my SaanSeoi map project.',
    '',
    missingProjectContextInstruction,
    '',
    '### First, understand the map I want to make',
    '',
    `Ask me what I want to show or help people do with the ${region} basemap. Establish the story, audience, locations or areas, geometry types, attributes, data source, and desired interaction before proposing any data. Tell me that I can answer any of these, and that you'll use that as a starting point to clarify the rest as we go along to refine the implementation.`,
    '',
    interaction,
    '',
    '### Create and add GeoJSON',
    '',
    'Help me obtain, create, or convert the agreed data to valid GeoJSON. Validate its coordinates and properties, place it in the project, and add it to the selected mapping library as a clear, accessible layer with any necessary legend, popup, or controls. Explain what each change does and verify it visibly in the running browser map.',
    ...deploymentInstructions,
    '',
    completionInstruction,
  ].join('\n')
}

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
    'Adapt the snippet to the project’s actual file structure, preserving the selected renderer and its existing setup.',
  ]
}

const createAMapStylePrompt = (state: CreateAMapLlmPromptState) =>
  [
    '## Style Section',
    '',
    'Continue the “Pick your styles” section of my SaanSeoi map project.',
    '',
    missingProjectContextInstruction,
    '',
    ...(state.rendererLabel
      ? [`- Selected mapping library: ${state.rendererLabel}`]
      : []),
    ...(state.styleLabel ? [`- Selected style: ${state.styleLabel}`] : []),
    '',
    '### Scope',
    '',
    ...createPromptInstructionLines(createSectionInstructions(state).style),
    '',
    createSectionCompletionInstruction('style'),
  ].join('\n')

const createPromptInstructionLines = (instructions: string[]) => {
  let inCodeBlock = false

  return instructions.flatMap(instruction =>
    instruction.split('\n').map(line => {
      const trimmedLine = line.trim()
      const isFence = trimmedLine.startsWith('```')
      const output = inCodeBlock || isFence || !trimmedLine ? line : `- ${line}`
      if (isFence) inCodeBlock = !inCodeBlock
      return output
    }),
  )
}

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
  dataStepReferences?: CreateAMapDataPromptReferences,
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
      '## Basemap Section',
      '',
      'Continue the “Add the SaanSeoi basemap” section of my SaanSeoi map project.',
      '',
      missingProjectContextInstruction,
      '',
      createAMapBasemapPrompt(state, mode),
      ...(localeInstruction ? [localeInstruction] : []),
      createSectionCompletionInstruction('basemap'),
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  if (section === 'style') {
    return createAMapStylePrompt(state)
  }

  if (section === 'data') {
    return createAMapDataStepPrompt(
      state,
      'fetchStats',
      mode,
      dataStepReferences?.fetchStats,
      false,
    )
  }

  return [
    `## ${sectionLabel(section)} Section`,
    '',
    `Continue the “${sectionLabel(section)}” section of my SaanSeoi map project.`,
    '',
    missingProjectContextInstruction,
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
  dataStepReferences?: CreateAMapDataPromptReferences,
) => createAMapProgressivePrompt(state, section, 'agentic', dataStepReferences)

/** Progressive hand-off for a web chat as the reader advances through the guide. */
export const createAMapChatSectionPrompt = (
  state: CreateAMapLlmPromptState,
  section: CreateAMapLlmPromptSection,
  dataStepReferences?: CreateAMapDataPromptReferences,
) => createAMapProgressivePrompt(state, section, 'chat', dataStepReferences)
