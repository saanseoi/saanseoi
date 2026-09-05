ALTER TABLE `streets` ADD `sources` text;--> statement-breakpoint
ALTER TABLE `divisionAreas` ADD `identifiers` text;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` ADD `identifiers` text;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `sourceKeys`;--> statement-breakpoint
ALTER TABLE `divisionAreas` DROP COLUMN `sourceKeys`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `sourceKeys`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `sourceKeys`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `sourceKeys`;--> statement-breakpoint
ALTER TABLE `divisionStatistics` DROP COLUMN `sourceKeys`;