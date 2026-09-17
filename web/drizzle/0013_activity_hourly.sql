CREATE TABLE "activity_hourly" (
	"hour" timestamp with time zone PRIMARY KEY NOT NULL,
	"steps" integer,
	"active_energy_kcal" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_hourly_steps_check" CHECK ("activity_hourly"."steps" IS NULL OR ("activity_hourly"."steps" >= 0 AND "activity_hourly"."steps" < 100000))
);
