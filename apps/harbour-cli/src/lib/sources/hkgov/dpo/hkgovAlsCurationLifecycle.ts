import estateComponentGaps from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-component-gaps.json'
import estateComponents from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-components.json'

export type HkgovAlsCurationApplication = {
  lastVerifiedSourceVersion: string
  mode: 'until-revoked'
  sourceVersionFrom: string
  state: 'active' | 'revoked'
}

export type HkgovAlsCurationVerification = 'unverified' | 'verified'

export type HkgovAlsEstateCurationFixture =
  | 'hkgov-dpo-address-estate-component-gaps.json'
  | 'hkgov-dpo-address-estate-components.json'

const estateCurationFixtures = {
  'hkgov-dpo-address-estate-component-gaps.json': estateComponentGaps,
  'hkgov-dpo-address-estate-components.json': estateComponents,
} as const

export function updateHkgovAlsEstateCurationApplication(
  fixtureName: HkgovAlsEstateCurationFixture,
  update: Partial<
    Pick<HkgovAlsCurationApplication, 'lastVerifiedSourceVersion' | 'state'>
  >,
) {
  const fixture = estateCurationFixtures[fixtureName]
  const application = fixture.application as HkgovAlsCurationApplication
  Object.assign(application, update)
  return application
}

export function serialiseHkgovAlsEstateCurationFixture(
  fixtureName: HkgovAlsEstateCurationFixture,
) {
  return `${JSON.stringify(estateCurationFixtures[fixtureName], null, 2)}\n`
}

/**
 * A listed source version is a closed historical repair. An active application
 * additionally covers later releases, but only where its own source assertions
 * still match. This keeps publisher corrections authoritative without making a
 * review fixture expire just because a new release arrived.
 */
export function resolveHkgovAlsCurationVerification(
  sourceVersion: string,
  scheduledVersions: readonly string[],
  application: HkgovAlsCurationApplication | undefined,
): HkgovAlsCurationVerification | null {
  if (scheduledVersions.includes(sourceVersion)) return 'verified'
  if (
    application?.state !== 'active' ||
    application.mode !== 'until-revoked' ||
    sourceVersion <= application.sourceVersionFrom
  ) {
    return null
  }
  return sourceVersion <= application.lastVerifiedSourceVersion
    ? 'verified'
    : 'unverified'
}

export function curationProvenance(input: {
  application: HkgovAlsCurationApplication | undefined
  id: string
  sourceVersion: string
  verification: HkgovAlsCurationVerification
}) {
  return {
    applicationMode: input.application?.mode ?? 'bounded-release',
    applicationState: input.application?.state ?? 'historical',
    lastVerifiedSourceVersion: input.application?.lastVerifiedSourceVersion ?? null,
    targetSourceVersion: input.sourceVersion,
    verificationStatus: input.verification,
  }
}
