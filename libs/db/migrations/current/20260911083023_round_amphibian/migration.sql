ALTER TABLE `divisions` ADD `category` text;--> statement-breakpoint
ALTER TABLE `divisions` ADD `class` text NOT NULL;--> statement-breakpoint
ALTER TABLE `divisions` ADD `hierarchies` text NOT NULL;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `hierarchy`;