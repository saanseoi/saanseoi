ALTER TABLE `statsMeasures` RENAME COLUMN `measurementKind` TO `statisticKind`;--> statement-breakpoint
ALTER TABLE `statsMeasures` ADD `aggregation` text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `statsMeasures` ADD `denominatorMeasureCode` text;