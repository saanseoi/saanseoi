import { confirm, isCancel, note, select } from '@clack/prompts'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type {
  StagedAddressResolution,
  SupplementaryDecision,
} from './supplementaryPlaceAddress.ts'
import {
  parseSupplementaryCuration,
  supplementaryIdentity,
} from './supplementaryPlaceAddress.ts'
import { editPlaceAddress } from './placeAddressEditor.ts'

const components = [
  ['buildingName', 'Building', 36],
  ['estateName', 'Estate', 35],
  ['blockExpression', 'Block', 33],
  ['phaseExpression', 'Phase', 33],
  ['buildingNumberExpression', 'Number', 32],
  ['streetName', 'Street', 34],
] as const

export function formatPlaceAddressComponents(
  value: Partial<PlaceAddressDefinition>,
  colour = Boolean(process.stdin.isTTY && !process.env.NO_COLOR),
) {
  return components
    .flatMap(([key, label, code]) => {
      const content = value[key]
      if (!content) return []
      // Source text must not be able to inject terminal control sequences.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip terminal controls from source data
      const clean = content.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      const part = `${label}: ${clean}`
      return [colour ? `\u001b[${code}m${part}\u001b[0m` : part]
    })
    .join(' | ')
}

export async function reviewPlaceAddressCurations(input: {
  rows: AsyncIterable<StagedAddressResolution>
  definitions: PlaceAddressDefinition[]
  curationPath: string
  sourceRelease: string
  total: number
}) {
  // The CLI log wrapper pipes stdout through tee; stdin retains the terminal.
  if (!process.stdin.isTTY) return 0
  const byId = Map.groupBy(input.definitions, row => row.addressId)
  const lockPath = `${input.curationPath}.review.lock`
  const lock = await open(lockPath, 'wx')
  let saved = 0
  try {
    let original = await readFile(input.curationPath, 'utf8')
    const policy = JSON.parse(original)
    parseSupplementaryCuration(policy)
    let index = 0
    for await (const row of input.rows) {
      if (row.tier !== 'review') continue
      index++
      if (
        policy.decisions.some(
          (decision: SupplementaryDecision) =>
            decision.placeId === row.placeId &&
            decision.fingerprint === row.fingerprint &&
            decision.sourceRelease === input.sourceRelease,
        )
      )
        continue
      const safe = (value: string) =>
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strip terminal controls from source data
        value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      note(
        [
          `Place: ${safe(row.placeId)}`,
          ...row.sourceTexts.map(value => `Source: ${safe(value)}`),
          `Reason: ${safe(row.reason)}`,
          `Previous: ${safe(row.previous?.addressId ?? 'none')}`,
          ...row.parsed.map(parsed =>
            formatPlaceAddressComponents({
              ...Object.fromEntries(
                parsed.recognised2dComponents.map(component => [
                  component.kind,
                  component.name,
                ]),
              ),
              streetName: parsed.street?.name,
              buildingNumberExpression: parsed.buildingNumberExpression,
            }),
          ),
        ].join('\n'),
        `Place Address review ${index}/${input.total}`,
      )
      const candidates = row.candidates.filter(candidate =>
        byId.has(candidate.addressId),
      )
      let decision: SupplementaryDecision | undefined
      while (!decision) {
        const choice = await select({
          message: 'Inspect an ALS candidate or choose an action',
          options: [
            { value: 'exit', label: 'Save and exit review' },
            { value: 'skip', label: 'Skip — keep unresolved' },
            { value: 'retire', label: 'Leave unlinked — record explicit retirement' },
            ...candidates.map(candidate => ({
              value: `id:${candidate.addressId}`,
              label: safe(
                byId.get(candidate.addressId)?.[0]?.formattedAddress ??
                  candidate.addressId,
              ),
              hint: `score ${candidate.score}; ${candidate.distanceMetres === null ? 'distance unknown' : `${Math.round(candidate.distanceMetres)} m`}; conflicts: ${candidate.contradictions.join(', ') || 'none'}`,
            })),
          ],
        })
        if (isCancel(choice) || choice === 'exit') return saved
        if (choice === 'skip') break
        const addressId = choice.startsWith('id:') ? choice.slice(3) : null
        if (addressId)
          note(
            (byId.get(addressId) ?? [])
              .map(value => `${value.locale}\n${formatPlaceAddressComponents(value)}`)
              .join('\n\n'),
            `ALS ${addressId}`,
          )
        let edited: SupplementaryDecision['address']
        if (addressId) {
          const action = await select({
            message: 'Use this address or edit a supplementary address?',
            options: [
              { value: 'use', label: 'Use the ALS address as recorded' },
              {
                value: 'edit',
                label: 'Edit address components, including building number range',
              },
              { value: 'back', label: 'Back to candidates' },
            ],
          })
          if (isCancel(action)) return saved
          if (action === 'back') continue
          if (action === 'edit') {
            const definitions = byId.get(addressId) ?? []
            const locale =
              definitions.length === 1
                ? definitions[0]?.locale
                : await select({
                    message: 'Address language to edit',
                    options: definitions.map(value => ({
                      value: value.locale,
                      label: value.locale,
                    })),
                  })
            if (isCancel(locale)) return saved
            const seed = definitions.find(value => value.locale === locale)
            if (!seed) continue
            const value = await editPlaceAddress(seed)
            if (!value) continue
            edited = { baseAddressId: addressId, values: [value] }
            note(
              `${safe(value.formattedAddress)}\n${formatPlaceAddressComponents(value)}`,
              'Edited supplementary address',
            )
          }
        }
        const accepted = await confirm({
          message: edited
            ? 'Save this edited supplementary address? The ALS source record is preserved.'
            : addressId
              ? 'Record this ALS identity for this Place?'
              : 'Record that this Place should have no Address link?',
          initialValue: false,
        })
        if (isCancel(accepted)) return saved
        if (!accepted) continue
        decision = {
          placeId: row.placeId,
          fingerprint: row.fingerprint,
          sourceRelease: input.sourceRelease,
          previousAddressId: row.previous?.addressId ?? null,
          resolution: addressId ? 'replace' : 'retire',
          addressId,
          reason: edited
            ? 'Edited supplementary address in interactive review.'
            : addressId
              ? 'Selected ALS identity in interactive review.'
              : 'Left unlinked in interactive review.',
        }
        if (edited) {
          decision.address = edited
          decision.addressId = supplementaryIdentity(edited.values).addressId
        }
      }
      if (!decision) continue
      if ((await readFile(input.curationPath, 'utf8')) !== original)
        throw new Error(
          'Place Address policy changed during review; saved decisions are retained. Reopen review.',
        )
      policy.decisions.push(decision)
      parseSupplementaryCuration(policy)
      const next = `${JSON.stringify(policy, null, 2)}\n`
      const temporary = `${input.curationPath}.${crypto.randomUUID()}.tmp`
      const file = await open(temporary, 'wx')
      try {
        await file.writeFile(next)
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, input.curationPath)
      original = next
      saved++
    }
    return saved
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
