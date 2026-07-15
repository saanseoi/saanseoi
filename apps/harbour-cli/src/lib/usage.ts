import { resourceThemes, resourceTypes } from '@repo/core'

export function printUsage() {
  console.log(`  Usage:
  saanseoi upload <file> [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--theme ${resourceThemes.join('|')}] [--region hk|mo] [--cohort-key VALUE] [--release-notes-url URL] [--dry-run] [--force] [--skip-cleanup] [--yes] [--verbose]
  saanseoi cleanup:snapshots [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--snapshot <snapshot-id>[,<snapshot-id>...]] [--delay-seconds 30] [--dry-run] [--yes]
  saanseoi docs:new [--target local|preview|production] [--scope apiReleaseSets|releases] [--region hk|mo] [--api-family addresses|divisions|places] [--dataset CODE] [--release CODE] [--cohort-key VALUE]
  saanseoi docs:publish [--target local|preview|production] [--scope apiReleaseSets|releases|all] [--dry-run]
  saanseoi rollback:release --release <latest-release-id|release-code> [--target local|preview|production] [--region hk|mo] [--shard-year YYYY] [--dry-run]
  saanseoi inspect [--stage normalized|resolved|operations] [--resourceType address] [--releaseCode VALUE] [--dbShard source|history|current] [--sample first|last|random] [--persist-to .local/d1/dev] [--out-dir .]
  saanseoi prep-hkgov-dpo <source-dir> [--target local|preview|production] [--source-version YYYY-MM-DD.NN] [--cohort-key VALUE] [--db /path/to/local.sqlite]
  saanseoi reports:ingestion [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
  saanseoi reports:stats [--target local|preview|production] [--limit 1-100] [--source SOURCE] [--type TYPE]
  saanseoi reports:releases [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
`)
}
