import { resourceThemes, resourceTypes } from '@repo/core'

export function printUsage() {
  console.log(`  Usage:
  saanseoi upload <file> [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--theme ${resourceThemes.join('|')}] [--region hk|mo] [--cohort-key VALUE] [--transform simplified] [--release-notes-url URL] [--dry-run] [--force] [--skip-cleanup] [--validate-geometry] [--yes] [--verbose]
  saanseoi init [--continue]
  saanseoi init:divisions:overture [--continue]
  saanseoi init:divisions:hkgov-pland-pu [--continue]
  saanseoi init:divisions:hkgov-pland-new-town [--continue]
  saanseoi init:streets:hkgov-landsd
  saanseoi tiles:refresh [--region gba|hk|mo] [--dry-run] [--force]
  saanseoi tiles:backfill --region gba|hk|mo --date YYYY-MM-DD --file PATH [--dry-run]
  saanseoi tiles:retract --region gba|hk|mo --date YYYY-MM-DD [--dry-run]
  saanseoi tiles:render --region gba|hk|mo --date YYYY-MM-DD [--mode light|dark] [--dry-run]
  saanseoi schedule [--dry-run]
  saanseoi init:addresses:default [--continue]
  saanseoi update [--target local|preview|production] [--api-family|--scope all|addresses|divisions|places|stats|streets] [--dataset CODE[,CODE...]] [--download] [--force-download] [--no-upload] [--force|--check-now] [--yes]
  saanseoi cleanup:snapshots [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--snapshot <snapshot-id>[,<snapshot-id>...]] [--delay-seconds 30] [--dry-run] [--yes]
  saanseoi docs:new [--target local|preview|production] [--scope apiReleaseSets|releases] [--region hk|mo] [--api-family addresses|divisions|places] [--dataset CODE] [--release CODE] [--cohort-key VALUE]
  saanseoi docs:publish [--target local|preview|production] [--scope apiReleaseSets|releases|all] [--dry-run]
  saanseoi rollback:release --release <latest-release-id|release-code> [--target local|preview|production] [--region hk|mo] [--shard-year YYYY] [--dry-run]
  saanseoi version:bump [--type apiVersion|apiComposition|schemaVersion|rulesetVersion] [--code CODE] [--editor zed] [--no-open]
  saanseoi version:publish [--target local|preview|production] [--code CODE] [--dry-run]
  saanseoi version:promote [--target local|preview|production] [--code CODE]
  saanseoi version:status
  saanseoi version:doctor
  saanseoi inspect [--stage normalised|resolved|operations] [--resourceType address] [--releaseCode VALUE] [--dbShard source|history|current] [--sample first|last|random] [--persist-to .local/d1/dev] [--out-dir .]
  saanseoi reports:ingestion [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
  saanseoi reports:stats [--target local|preview|production] [--limit 1-100] [--source SOURCE] [--type TYPE]
  saanseoi reports:processing-actions [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
  saanseoi reports:releases [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
`)
}
