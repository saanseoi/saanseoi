ALTER TABLE `divisions` ADD `divisionCode` text;--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`snapshotId`,`divisionCode`);