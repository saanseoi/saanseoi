export type ReleaseCodeParts = {
  family: string
  version: string
}

const releaseVersionPattern =
  /^(.*)-(\d{4}(?:-(?:\d{2}-\d{2})|['-](?:q[1-4]|h[1-2]))?(?:\.\d+)?(?:-r\d+)?)$/i
const releasePeriodVersionPattern = /^(\d{4})['-]([q][1-4]|h[1-2])(?:-r(\d+))?$/i

function formatReleaseVersion(version: string) {
  const displayVersion = version.replace(/-r0$/i, '')
  const period = displayVersion.match(releasePeriodVersionPattern)
  if (!period?.[1] || !period[2]) return displayVersion

  const revision = period[3] ? `-R${period[3]}` : ''
  return `${period[1]}'${period[2].toUpperCase()}${revision}`
}

export function getReleaseCodeParts(code: string, apiFamily: string): ReleaseCodeParts {
  const codeWithoutDomain = code.split('--', 1)[0] ?? code
  const matched = codeWithoutDomain.match(releaseVersionPattern)

  return matched
    ? { family: matched[1] ?? apiFamily, version: matched[2] ?? code }
    : { family: apiFamily, version: code }
}

export function getReleaseVersionLabel(code: string, apiFamily: string) {
  return `v${formatReleaseVersion(getReleaseCodeParts(code, apiFamily).version)}`
}
