CREATE TABLE IF NOT EXISTS "cardio_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"activity_name" text DEFAULT '' NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"level" integer,
	"distance_km" double precision,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_checkins" ADD COLUMN IF NOT EXISTS "had_alcohol" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'cardio_entries_session_id_workout_sessions_id_fk'
			AND conrelid = 'public.cardio_entries'::regclass
	) THEN
		ALTER TABLE "cardio_entries"
			ADD CONSTRAINT "cardio_entries_session_id_workout_sessions_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cardio_entries_session_id_idx" ON "cardio_entries" USING btree ("session_id");
