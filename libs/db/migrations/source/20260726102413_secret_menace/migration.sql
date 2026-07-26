ALTER TABLE `hkgovLandsdStreetBaselineRecords` ADD `deferToNotices` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` ADD `englishName` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` ADD `chineseName` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` ADD `districtCode` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeApplications` ADD `sourceStreetId` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeApplications` ADD `resultStreetId` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` ADD `noticeType` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` ADD `noticeRef` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` ADD `effectiveDate` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` ADD `evidenceAssets` text NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecords_expectNoticeHistory_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNoticeApplications_affectedStreet_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNoticeApplications_createdStreet_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNotices_noticeIdentity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecordI18n_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecordI18n_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecordI18n_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecordI18n_release_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecordI18n_locale_name_idx`;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_deferToNotices_idx` ON `hkgovLandsdStreetBaselineRecords` (`deferToNotices`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_sourceStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_resultStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`resultStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_noticeRef_idx` ON `hkgovLandsdStreetNotices` (`noticeRef`);--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetBaselineRecordI18n`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` DROP COLUMN `expectNoticeHistory`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` DROP COLUMN `districtCodes`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` DROP COLUMN `sourceAssetLinks`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` DROP COLUMN `sourcePageSnapshots`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` DROP COLUMN `rawProperties`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeApplications` DROP COLUMN `affectedStreetId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeApplications` DROP COLUMN `createdStreetId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `governmentNoticeType`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `noticeIdentity`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `parsedEffectiveDate`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `district`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `sourceAssetLinks`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `sourcePageSnapshots`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `translationAudit`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` DROP COLUMN `rawProperties`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeI18n` DROP COLUMN `district`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeI18n` DROP COLUMN `assetLinks`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeI18n` DROP COLUMN `translationProvenance`;