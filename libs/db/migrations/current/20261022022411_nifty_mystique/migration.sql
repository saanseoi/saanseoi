ALTER TABLE `address2d` RENAME COLUMN `granularity` TO `scope`;--> statement-breakpoint
ALTER TABLE `address2d` ADD `premisesType` text;