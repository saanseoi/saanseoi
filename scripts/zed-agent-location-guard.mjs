import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export const MAX_AGENT_LOCATION_BYTES = 4 * 1024 * 1024

// Zed eagerly opens these navigation targets as retained editor buffers.
// Keep tool output and explicit diffs intact; only filter automatic locations.
export function guardZedAgentLocations(toolCall) {
  if (!Array.isArray(toolCall.locations)) return toolCall
  toolCall.locations = toolCall.locations.filter(location => {
    if (typeof location.path !== 'string' || !isAbsolute(location.path)) {
      return false
    }
    try {
      const file = statSync(location.path)
      return file.isFile() && file.size <= MAX_AGENT_LOCATION_BYTES
    } catch {
      return false
    }
  })
  // Keep an empty array to clear any locations supplied by an earlier update.
  return toolCall
}
