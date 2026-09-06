import { isCancel, note, select } from '@clack/prompts'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type {
  StagedAddressResolution,
  SupplementaryDecision,
} from './supplementaryPlaceAddress.ts'
import {
  parseSupplementaryCuration,
  parsedAddressFingerprint,
  supplementaryIdentity,
} from './supplementaryPlaceAddress.ts'
import {
  addressEditorFields,
  editPlaceAddress,
  localiseEditedAddress,
  parsedAddressSeed,
  safeAddressText,
} from './placeAddressEditor.ts'

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

export function deferChineseAddressReview(
  row: Pick<StagedAddressResolution, 'sourceTexts'>,
) {
  return row.sourceTexts.some(value => /\p{Script=Han}/u.test(value))
}

export async function reviewPlaceAddressCurations(input: {
  rows: AsyncIterable<StagedAddressResolution>
  definitions: PlaceAddressDefinition[]
  geometry: Map<string, { lng: number; lat: number }>
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
  let deferred = 0
  try {
    let original = await readFile(input.curationPath, 'utf8')
    const policy = JSON.parse(original)
    parseSupplementaryCuration(policy)
    let index = 0
    for await (const row of input.rows) {
      if (row.tier !== 'review') continue
      index++
      // Keep the complete evidence unresolved, including mixed-language addresses.
      // Skipping the UI must not create a retirement or an identity decision.
      if (deferChineseAddressReview(row)) {
        deferred++
        continue
      }
      if (
        policy.decisions.some(
          (decision: SupplementaryDecision) =>
            decision.placeId === row.placeId &&
            decision.fingerprint === row.fingerprint &&
            decision.sourceRelease === input.sourceRelease,
        )
      )
        continue
      note(
        formatReviewNote(row),
        `Place Address :: ${safeAddressText(row.placeId)} (${index}/${input.total})`,
      )
      const candidates = row.candidates.flatMap(candidate => {
        if (
          candidate.score < 50 &&
          candidate.distanceMetres !== null &&
          candidate.distanceMetres > 500
        )
          return []
        const definition = byId
          .get(candidate.addressId)
          ?.find(value => value.locale === 'en')
        return definition ? [{ candidate, definition }] : []
      })
      let decision: SupplementaryDecision | undefined
      while (!decision) {
        const choice = await select({
          message: 'Choose an address or action',
          options: [
            ...candidates.map(({ candidate, definition }) => ({
              value: `id:${candidate.addressId}`,
              label: formatAddressCandidate(definition, candidate),
            })),
            { value: 'map', label: 'Show on Map' },
            { value: 'new', label: 'New Address' },
            { value: 'skip', label: 'Skip as Unresolved' },
            { value: 'leave_unlinked', label: 'Skip as Unlinked' },
            { value: 'exit', label: 'Save & Exit' },
          ],
        })
        if (isCancel(choice) || choice === 'exit') return saved
        if (choice === 'map') {
          await showCandidatesOnMap(row, candidates, input.geometry)
          continue
        }
        if (choice === 'skip') break
        const addressId = choice.startsWith('id:') ? choice.slice(3) : null
        let edited: SupplementaryDecision['address']
        if (choice !== 'leave_unlinked') {
          const definitions = addressId ? (byId.get(addressId) ?? []) : []
          const seed =
            definitions.find(value => value.locale === 'en') ??
            parsedAddressSeed(
              row.parsed.find(value => value.street?.locale === 'en') ?? row.parsed[0],
            )
          const value = await editPlaceAddress(seed)
          if (!value) continue
          if (
            !addressId ||
            addressEditorFields.some(([key]) => value[key] !== seed[key])
          ) {
            edited = {
              baseAddressId: addressId,
              values: localiseEditedAddress(
                value,
                seed,
                definitions.find(value => value.locale === 'zh-hant'),
              ),
            }
          }
        }
        decision = {
          placeId: row.placeId,
          fingerprint: row.fingerprint,
          address2dFingerprint: parsedAddressFingerprint(row.parsed),
          sourceRelease: input.sourceRelease,
          previousAddressId: row.previous?.addressId ?? null,
          resolution:
            choice === 'leave_unlinked'
              ? 'leave_unlinked'
              : edited
                ? 'create_supplementary'
                : 'link_existing',
          addressId,
          reason: edited
            ? 'Saved supplementary address in interactive review.'
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
    if (deferred)
      note(
        `${deferred} Chinese or mixed-language source addresses deferred. They remain unresolved in the review file.`,
        'Deferred address review',
      )
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )
}

export async function showCandidatesOnMap(
  row: Pick<StagedAddressResolution, 'placeId' | 'sourceTexts' | 'lng' | 'lat'>,
  candidates: Array<{
    candidate: StagedAddressResolution['candidates'][number]
    definition: PlaceAddressDefinition
  }>,
  geometry: Map<string, { lng: number; lat: number }>,
) {
  if (row.lng === undefined || row.lat === undefined) {
    note('This review record has no place coordinates.', 'Map unavailable')
    return
  }
  const markers = candidates.flatMap(({ candidate, definition }) => {
    const point = geometry.get(candidate.addressId)
    return point
      ? [
          {
            ...point,
            score: candidate.score,
            label: definition.formattedAddress ?? candidate.addressId,
          },
        ]
      : []
  })
  const title = escapeHtml(row.sourceTexts.join(' / '))
  const html = `<!doctype html><meta charset="utf-8"><title>Address candidates</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.7.0/dist/maplibre-gl.css"><style>html,body,#map{height:100%;margin:0}</style><div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@6.7.0/dist/maplibre-gl.js"></script><script>
const source=[${row.lng},${row.lat}], candidates=${JSON.stringify(markers)};
const map=new maplibregl.Map({container:'map',style:'https://tiles.hype.hk/basemap/hongkong-latest.json',center:source,zoom:16}); map.addControl(new maplibregl.NavigationControl());
map.on('load',()=>{const features=[{type:'Feature',geometry:{type:'Point',coordinates:source},properties:{kind:'source',label:${JSON.stringify(title)}}},...candidates.map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lng,c.lat]},properties:{kind:'candidate',score:c.score,label:c.label}}))];
map.addSource('address-review',{type:'geojson',data:{type:'FeatureCollection',features}}); map.addLayer({id:'candidates',type:'circle',source:'address-review',filter:['==',['get','kind'],'candidate'],paint:{'circle-radius':8,'circle-color':['interpolate',['linear'],['get','score'],0,'hsl(12 20% 48%)',100,'hsl(12 100% 48%)'],'circle-stroke-color':'#fff','circle-stroke-width':2}}); map.addLayer({id:'place-source',type:'circle',source:'address-review',filter:['==',['get','kind'],'source'],paint:{'circle-radius':10,'circle-color':'#2563eb','circle-stroke-color':'#fff','circle-stroke-width':3}});
map.on('click',['candidates','place-source'],e=>new maplibregl.Popup().setLngLat(e.lngLat).setHTML(e.features[0].properties.kind==='source'?'<b>Place source</b><br>'+e.features[0].properties.label:'<b>Score '+e.features[0].properties.score+'</b><br>'+e.features[0].properties.label).addTo(map));
const bounds=new maplibregl.LngLatBounds(source,source); for(const c of candidates) bounds.extend([c.lng,c.lat]); if(candidates.length) map.fitBounds(bounds,{padding:60,maxZoom:17});});
</script>`
  const path = join(tmpdir(), `saanseoi-address-candidates-${crypto.randomUUID()}.html`)
  await Bun.write(path, html)
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  Bun.spawn([command, path], { stdout: 'ignore', stderr: 'ignore' })
  note(`Opened candidate map: ${path}`, 'Show on Map')
}

const reasonLabels: Record<string, string> = {
  unlinked_address_changed: 'Previously unlinked source address has changed',
  multiple_close_matches: 'Several candidates have similar scores',
  contradictory_components: 'Address components disagree',
  identity_drift: 'Previously linked address has changed',
  ambiguous_exact_addresses: 'Multiple exact matches',
  multiple_address_localisations: 'Source language variants need review',
  decision_previous_link_mismatch:
    'Previously linked address differs from the saved decision',
  decision_base_not_available: 'The selected ALS address is unavailable',
  keep_decision_changes_identity: 'The saved decision changes the previous identity',
  decision_target_not_reproducible: 'The saved address cannot be reproduced',
  shared_address_base_drift: 'Shared supplementary address has a different ALS base',
}

export function formatReviewNote(
  row: StagedAddressResolution,
  colour = Boolean(process.stdin.isTTY && !process.env.NO_COLOR),
) {
  return [
    ...row.sourceTexts.map(value => `Source : ${safeAddressText(value)}`),
    `Parsed: ${reasonLabels[row.reason] ?? safeAddressText(row.reason.replaceAll('_', ' '))}`,
    ...row.parsed.flatMap(parsed => [
      ...[...parsed.address3dParts]
        .sort((a, b) => Number(a.kind === 'floor') - Number(b.kind === 'floor'))
        .map(part =>
          part.kind === 'unit'
            ? `- Unit : ${safeAddressText(part.unitExpression)}`
            : `- Floor : ${safeAddressText(part.floorExpression)}`,
        ),
      ...addressEditorFields.flatMap(([key, label]) => {
        const value = parsedAddressSeed(parsed)[key]
        if (!value) return []
        const componentKey =
          key === 'buildingNumberFrom' || key === 'buildingNumberTo'
            ? 'buildingNumberExpression'
            : key
        const code = components.find(([field]) => field === componentKey)?.[2]
        const content = safeAddressText(value)
        return [
          `- ${label} : ${colour && code ? `\u001b[${code}m${content}\u001b[0m` : content}`,
        ]
      }),
      ...(parsed.unclassified2dText
        ? [`- Unclassified : ${safeAddressText(parsed.unclassified2dText)}`]
        : []),
    ]),
    ...(row.previous ? [`Previous : ${safeAddressText(row.previous.addressId)}`] : []),
  ].join('\n')
}

export function formatAddressCandidate(
  value: PlaceAddressDefinition,
  candidate: StagedAddressResolution['candidates'][number],
  colour = Boolean(process.stdin.isTTY && !process.env.NO_COLOR),
) {
  const formatted = safeAddressText(value.formattedAddress ?? '')
  // Match longest components first, preserving the exact ALS formatting and divisions.
  const pieces = components
    .flatMap(([key, , code]) => {
      const text = value[key]
      return text ? [{ text: safeAddressText(text), code }] : []
    })
    .sort((a, b) => b.text.length - a.text.length)
  let label = ''
  for (let offset = 0; offset < formatted.length; ) {
    const part = pieces.find(piece => formatted.startsWith(piece.text, offset))
    if (part) {
      label += colour ? `\u001b[${part.code}m${part.text}\u001b[0m` : part.text
      offset += part.text.length
    } else label += formatted[offset++]
  }
  const detail = `(${candidate.score} @ ${candidate.distanceMetres === null ? '?' : `${Math.round(candidate.distanceMetres)} m`}${candidate.contradictions.length ? ` !${candidate.contradictions.map(safeAddressText).join(', ')}` : ''})`
  return `${label} ${colour ? `\u001b[2m${detail}\u001b[0m` : detail}`
}
