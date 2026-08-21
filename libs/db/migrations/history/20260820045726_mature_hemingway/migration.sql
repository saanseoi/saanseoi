ALTER TABLE `statsRecords` ADD `referencePeriodEndYear` text NOT NULL DEFAULT '0000';--> statement-breakpoint
UPDATE `statsRecords`
SET `referencePeriodEndYear` = CASE
	WHEN `referencePeriodEnd` GLOB '[0-9][0-9][0-9][0-9]-*' THEN substr(`referencePeriodEnd`, 1, 4)
	WHEN substr(`referencePeriodCode`, -4) GLOB '[0-9][0-9][0-9][0-9]' THEN substr(`referencePeriodCode`, -4)
	WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9]' THEN printf(
		'%04d',
		(CAST(substr(`referencePeriodCode`, 1, 4) AS integer) / 100 * 100) +
		CAST(substr(`referencePeriodCode`, 6, 2) AS integer) +
		CASE WHEN CAST(substr(`referencePeriodCode`, 6, 2) AS integer) < CAST(substr(`referencePeriodCode`, 3, 2) AS integer) THEN 100 ELSE 0 END
	)
	ELSE substr(`referencePeriodCode`, 1, 4)
END;--> statement-breakpoint
DROP INDEX IF EXISTS `statsMeasures_current_lookup_idx`;--> statement-breakpoint
DROP TABLE `statsDimensions`;--> statement-breakpoint
DROP TABLE `statsMeasures`;--> statement-breakpoint
DROP TABLE `statsMeasuresI18n`;--> statement-breakpoint
DROP TABLE `statsValues`;--> statement-breakpoint
DROP TABLE `statsValuesI18n`;
