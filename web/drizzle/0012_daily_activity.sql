CREATE TABLE "daily_activity" (
	"day" date PRIMARY KEY NOT NULL,
	"steps" integer,
	"active_energy_kcal" double precision,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activity_steps_check" CHECK ("daily_activity"."steps" IS NULL OR ("daily_activity"."steps" >= 0 AND "daily_activity"."steps" < 200000)),
	CONSTRAINT "daily_activity_energy_check" CHECK ("daily_activity"."active_energy_kcal" IS NULL OR ("daily_activity"."active_energy_kcal" >= 0 AND "daily_activity"."active_energy_kcal" < 10000))
);
