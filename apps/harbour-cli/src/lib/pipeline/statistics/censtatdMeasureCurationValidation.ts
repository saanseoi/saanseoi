import { isCancel, note, text } from '@clack/prompts'

export async function requiredFieldName(message: string, initialValue: string) {
  for (;;) {
    const value = await requiredText(message, initialValue)
    if (/^[a-z][A-Za-z0-9]*$/.test(value)) return value
    note(
      'Use a stable lower-camel-case identifier: begin with a lower-case letter and use only letters and digits.',
      'MEASURE METADATA',
    )
  }
}

export async function requiredText(message: string, initialValue?: string) {
  const answer = await text({
    initialValue,
    message,
    validate: value => ((value ?? '').trim() ? undefined : 'A value is required.'),
  })
  if (isCancel(answer)) throw new Error('C&SD field curation cancelled.')
  return (answer ?? '').trim()
}
