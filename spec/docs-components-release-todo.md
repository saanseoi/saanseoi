# Docs components release follow-up

This is a point-in-time inventory of the dirty state in the docs components and
outstanding route pages, captured on 2026-08-12. It is intended to let this work be set
aside while cutting the release.

## Before merging these changes

- [ ] Review and add the untracked release-links components (13 files).
- [ ] Review and add the untracked release-notes components (15 files).
- [ ] Review and add the untracked release-statistics components (30 files).
- [ ] Review the outstanding route pages listed below, including the already staged
      Create a Map page.
- [ ] Run the relevant Atlas App tests and type checks after the review.
- [ ] Decide whether this work belongs in a dedicated follow-up change before staging
      it. At capture time, all items below were unstaged or untracked.

## Dirty inventory

### Untracked: release links (13 files)

- `releaseLinks/index.ts`
- `releaseLinks/releaseLinksOutline.ts`
- `releaseLinks/releaseLinksOutline.test.ts`
- `releaseLinks/components/index.ts`
- `releaseLinks/components/releaseLinks.types.ts`
- `releaseLinks/components/releaseLinksActions.svelte`
- `releaseLinks/components/releaseLinksCard.svelte`
- `releaseLinks/components/releaseLinksEmptyState.svelte`
- `releaseLinks/components/releaseLinksGroup.svelte`
- `releaseLinks/components/releaseLinksProvenance.svelte`
- `releaseLinks/components/releaseLinksProvenanceFactGrid.svelte`
- `releaseLinks/components/releaseLinksRequestExample.svelte`
- `releaseLinks/components/releaseLinksRoot.svelte`

### Untracked: release notes (15 files)

- `releaseNotes/index.ts`
- `releaseNotes/releaseNotes.types.ts`
- `releaseNotes/releaseNotesContent.svelte.test.ts`
- `releaseNotes/releaseNotesRootTestHarness.svelte`
- `releaseNotes/releaseNotesRoot.svelte.test.ts`
- `releaseNotes/components/index.ts`
- `releaseNotes/components/releaseNotesArticle.svelte`
- `releaseNotes/components/releaseNotesBadge.svelte`
- `releaseNotes/components/releaseNotesCodeSpan.svelte`
- `releaseNotes/components/releaseNotesContent.svelte`
- `releaseNotes/components/releaseNotesEmptyState.svelte`
- `releaseNotes/components/releaseNotesHeading.svelte`
- `releaseNotes/components/releaseNotesLink.svelte`
- `releaseNotes/components/releaseNotesRoot.svelte`
- `releaseNotes/components/releaseNotesTransclusion.svelte`

### Untracked: release statistics (30 files)

- `releaseStats/index.ts`
- `releaseStats/releaseStats.types.ts`
- `releaseStats/releaseStatsFormat.ts`
- `releaseStats/releaseStatsPresentation.ts`
- `releaseStats/releaseStatsPresentation.test.ts`
- `releaseStats/releaseStatsRootTestHarness.svelte`
- `releaseStats/releaseStatsRoot.svelte.test.ts`
- `releaseStats/components/index.ts`
- `releaseStats/components/releaseStatsChurnMetric.svelte`
- `releaseStats/components/releaseStatsComponentCoverageSection.svelte`
- `releaseStats/components/releaseStatsCoverageBar.svelte`
- `releaseStats/components/releaseStatsDistributionBar.svelte`
- `releaseStats/components/releaseStatsDistrictSection.svelte`
- `releaseStats/components/releaseStatsEmptyState.svelte`
- `releaseStats/components/releaseStatsGenericGroup.svelte`
- `releaseStats/components/releaseStatsGenericGroups.svelte`
- `releaseStats/components/releaseStatsInfoTooltip.svelte`
- `releaseStats/components/releaseStatsLegend.svelte`
- `releaseStats/components/releaseStatsLocaleCoverageSection.svelte`
- `releaseStats/components/releaseStatsOverviewSection.svelte`
- `releaseStats/components/releaseStatsPanel.svelte`
- `releaseStats/components/releaseStatsProcessingMetric.svelte`
- `releaseStats/components/releaseStatsProcessingSection.svelte`
- `releaseStats/components/releaseStatsQualityMetric.svelte`
- `releaseStats/components/releaseStatsQualitySection.svelte`
- `releaseStats/components/releaseStatsResults.svelte`
- `releaseStats/components/releaseStatsRoot.svelte`
- `releaseStats/components/releaseStatsSection.svelte`
- `releaseStats/components/releaseStatsSectionHeader.svelte`
- `releaseStats/components/releaseStatsTypeDistributionSection.svelte`

## Outstanding route pages

### Untracked

- `apps/atlas-app/src/routes/guides/download-dataset/+page.svelte`
- `apps/atlas-app/src/routes/themes/+page.svelte`
