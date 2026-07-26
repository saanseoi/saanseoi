CREATE TABLE `hkgovLandsdStreetBaselineRecordI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`district` text,
	`assetLinks` text,
	`translationProvenance` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetBaselineRecordI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetBaselineRecords` (
	`sourceRecordId` text NOT NULL,
	`streetId` text NOT NULL,
	`expectNoticeHistory` integer NOT NULL,
	`districtCodes` text,
	`sourceAssetLinks` text,
	`sourcePageSnapshots` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetBaselineRecords_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNoticeApplications` (
	`sourceRecordId` text NOT NULL,
	`method` text NOT NULL,
	`disposition` text NOT NULL,
	`affectedStreetId` text,
	`createdStreetId` text,
	`nameChangeScope` text,
	`retainedDescriptions` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNoticeApplications_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNoticeI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`district` text,
	`assetLinks` text,
	`translationProvenance` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNoticeI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNotices` (
	`sourceRecordId` text NOT NULL,
	`gazetteDate` text NOT NULL,
	`governmentNoticeType` text NOT NULL,
	`noticeIdentity` text,
	`parsedEffectiveDate` text,
	`previousGovernmentNoticeReferences` text,
	`rawExtractedText` text,
	`parserDiagnostics` text,
	`district` text,
	`districtCodes` text,
	`sourceAssetLinks` text,
	`sourcePageSnapshots` text,
	`translationAudit` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNotices_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_release_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_locale_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetI18n_name_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_release_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_publicationDate_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreets_noticeType_idx`;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecordI18n_releaseId_idx` ON `hkgovLandsdStreetBaselineRecordI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecordI18n_sourceRecordId_idx` ON `hkgovLandsdStreetBaselineRecordI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecordI18n_current_lookup_idx` ON `hkgovLandsdStreetBaselineRecordI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecordI18n_release_validity_idx` ON `hkgovLandsdStreetBaselineRecordI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecordI18n_locale_name_idx` ON `hkgovLandsdStreetBaselineRecordI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_releaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_sourceRecordId_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_current_lookup_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_release_validity_idx` ON `hkgovLandsdStreetBaselineRecords` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_street_idx` ON `hkgovLandsdStreetBaselineRecords` (`streetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_expectNoticeHistory_idx` ON `hkgovLandsdStreetBaselineRecords` (`expectNoticeHistory`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_releaseId_idx` ON `hkgovLandsdStreetNoticeApplications` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_sourceRecordId_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_current_lookup_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_release_validity_idx` ON `hkgovLandsdStreetNoticeApplications` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_affectedStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`affectedStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_createdStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`createdStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_releaseId_idx` ON `hkgovLandsdStreetNoticeI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_sourceRecordId_idx` ON `hkgovLandsdStreetNoticeI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_current_lookup_idx` ON `hkgovLandsdStreetNoticeI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_release_validity_idx` ON `hkgovLandsdStreetNoticeI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_locale_name_idx` ON `hkgovLandsdStreetNoticeI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_releaseId_idx` ON `hkgovLandsdStreetNotices` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_sourceRecordId_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_current_lookup_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_release_validity_idx` ON `hkgovLandsdStreetNotices` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_gazetteDate_idx` ON `hkgovLandsdStreetNotices` (`gazetteDate`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_noticeType_idx` ON `hkgovLandsdStreetNotices` (`governmentNoticeType`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_noticeIdentity_idx` ON `hkgovLandsdStreetNotices` (`noticeIdentity`);--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetI18n`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreets`;