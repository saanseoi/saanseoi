ALTER TABLE `hkgovLandsdStreetI18n` ADD `description` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `curationStatus` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `curationPatchId` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `noticeIdentity` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `parsedEffectiveDate` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `previousGovernmentNoticeReferences` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `rawExtractedText` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` ADD `parserDiagnostics` text;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetI18n` DROP COLUMN `governmentNoticeLabel`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetI18n` DROP COLUMN `governmentNoticeUrl`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetI18n` DROP COLUMN `gazettePlanUrls`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreets` DROP COLUMN `districtIds`;