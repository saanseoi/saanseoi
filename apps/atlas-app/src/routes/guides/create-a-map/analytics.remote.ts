import { command, getRequestEvent } from '$app/server'
import { createAMapSelectionChoices } from '#lib/guides/createAMapSelections.js'
import { writeServerProductUsage } from '#lib/analytics/productUsage.js'
import { z } from 'zod'

const choices = createAMapSelectionChoices

const selectionSchema = z
  .object({
    objective: z.enum(choices.objective),
    operatingSystem: z.enum(choices.operatingSystem).optional(),
    terminalExperience: z.enum(choices.terminalExperience).optional(),
    codeEditor: z.enum(choices.codeEditor).optional(),
    llmMode: z.enum(choices.llmMode),
    aiAccess: z.enum(choices.aiAccess).optional(),
    vpnAccess: z.enum(choices.vpnAccess).optional(),
    agentTool: z.enum(choices.agentTool).optional(),
    llm: z.enum(choices.llm).optional(),
    hosting: z.enum(choices.hosting).optional(),
    websitePlatform: z.enum(choices.websitePlatform).optional(),
    mobileLibrary: z.enum(choices.mobileLibrary).optional(),
    mobilePlatform: z.enum(choices.mobilePlatform).optional(),
    notebookLibrary: z.enum(choices.notebookLibrary).optional(),
    notebookRuntime: z.enum(choices.notebookRuntime).optional(),
    renderer: z.enum(choices.renderer).optional(),
    region: z.enum(choices.region).optional(),
    style: z.enum(choices.style).optional(),
    dataSource: z.enum(choices.dataSource).optional(),
    dataFormat: z.enum(choices.dataFormat).optional(),
  })
  .strict()

type SelectionKey = keyof typeof choices
const selectionKeys = Object.keys(choices) as SelectionKey[]
const notSelected = 'not-selected'

/**
 * Dataset: ss-map-guide-selections-<environment>
 *
 * blob1: event name; blob2: schema version; blobs 3-22: guide selections in
 * `selectionKeys` order; double1: event count.
 */
export const trackCreateAMapSelection = command(selectionSchema, selection => {
  getRequestEvent().platform?.env.MAP_GUIDE_SELECTIONS.writeDataPoint({
    blobs: [
      'configuration',
      'v1',
      ...selectionKeys.map(key => selection[key] ?? notSelected),
    ],
    doubles: [1],
  })
  writeServerProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'guide',
    entityId: 'create-a-map',
  })
})
