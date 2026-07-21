export type ReleaseCodeParts = {
  family: string
  version: string
}

const releaseVersionPattern = /^(.*)-(\d{4}(?:-\d{2}-\d{2})?(?:\.\d+)?(?:-r\d+)?)$/

export function getReleaseCodeParts(code: string, apiFamily: string): ReleaseCodeParts {
  const codeWithoutDomain = code.split('--', 1)[0] ?? code
  const matched = codeWithoutDomain.match(releaseVersionPattern)

  return matched
    ? { family: matched[1] ?? apiFamily, version: matched[2] ?? code }
    : { family: apiFamily, version: code }
}
