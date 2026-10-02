ALTER TABLE `stats` RENAME COLUMN `dimension` TO `category`;--> statement-breakpoint
ALTER TABLE `stats` RENAME COLUMN `metric` TO `measure`;--> statement-breakpoint
ALTER TABLE `stats` RENAME COLUMN `metricUnit` TO `unit`;