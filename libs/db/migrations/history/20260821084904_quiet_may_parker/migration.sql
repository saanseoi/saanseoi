ALTER TABLE `statsMeasures` RENAME TO `statsFields`;--> statement-breakpoint
ALTER TABLE `statsMeasuresI18n` RENAME TO `statsFieldsI18n`;--> statement-breakpoint
ALTER TABLE `statsFields` RENAME COLUMN `measureCode` TO `fieldName`;--> statement-breakpoint
ALTER TABLE `statsFields` RENAME COLUMN `denominatorMeasureCode` TO `denominatorFieldName`;--> statement-breakpoint
ALTER TABLE `statsFieldsI18n` RENAME COLUMN `measureCode` TO `fieldName`;--> statement-breakpoint
ALTER TABLE `statsRecords` RENAME COLUMN `sourceFeatureId` TO `sourceFeatureRef`;--> statement-breakpoint
ALTER TABLE `statsFields` ADD `dimensions` text NOT NULL;--> statement-breakpoint
ALTER TABLE `statsRecords` ADD `geography` text NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `statsMeasures_current_lookup_idx`;--> statement-breakpoint
CREATE INDEX `statsFields_current_lookup_idx` ON `statsFields` (`datasetCode`,`fieldName`,`isCurrent`);--> statement-breakpoint
ALTER TABLE `statsRecords` DROP COLUMN `geographyCohortId`;