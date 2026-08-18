/** Preserve source text while preventing it from controlling terminal rendering. */
export function terminalSafeText(value: string) {
  return [...value]
    .map(character => {
      const codePoint = character.codePointAt(0) ?? 0
      const isUnsafe =
        codePoint <= 8 ||
        (codePoint >= 11 && codePoint <= 31) ||
        (codePoint >= 127 && codePoint <= 159) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069)
      return isUnsafe ? '\ufffd' : character
    })
    .join('')
}
