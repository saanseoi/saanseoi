import { buildPlaceTranslationFixtureFromParquet } from '../apps/harbour-cli/src/lib/i18n/buildPlaceTranslationFixture.ts'

const options = new Map<string, string>()
for (let index = 2; index < Bun.argv.length; index += 1) {
  const key = Bun.argv[index]
  const value = Bun.argv[index + 1]
  if (key?.startsWith('--') && value && !value.startsWith('--')) {
    options.set(key.slice(2), value)
    index += 1
  }
}

const inputPath = options.get('input')
const sourceRelease = options.get('source-release')
const sourceVersion =
  options.get('source-version') ?? sourceRelease?.split('-').slice(-3).join('-')
if (!inputPath || !sourceRelease || !sourceVersion) {
  throw new Error(
    'Usage: bun scripts/build-place-translation-fixture.ts --input PATH --source-release RELEASE [--source-version VERSION] [--fixture PATH]',
  )
}

const result = await buildPlaceTranslationFixtureFromParquet({
  inputPath,
  sourceRelease,
  sourceVersion,
  fixturePath: options.get('fixture'),
  batchSize: 50,
})
console.log(JSON.stringify(result, null, 2))
