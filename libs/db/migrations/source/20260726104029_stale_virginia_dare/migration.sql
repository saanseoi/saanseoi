ALTER TABLE `hkgovLandsdStreetNotices` RENAME COLUMN `noticeType` TO `kind`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` RENAME COLUMN `previousGovernmentNoticeReferences` TO `previousNoticeRefs`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNotices_noticeType_idx`;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_kind_idx` ON `hkgovLandsdStreetNotices` (`kind`);