DROP INDEX IF EXISTS `divisions_parentDivisionId_idx`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `parentDivisionId`;