/*
 * Migration de réconciliation 2026-08-09.
 *
 * IMPORTANT : les anciennes colonnes `timestamp without time zone` contiennent
 * des instants UTC dont seul le suffixe a été perdu (les ISO `...Z` des exports
 * correspondent octet pour octet aux valeurs SQL). Il faut donc les interpréter
 * en UTC. `AT TIME ZONE 'Europe/Paris'` décalerait l'historique de 1/2 heures.
 *
 * Chaque opération est rejouable : cette migration sert aussi à remettre en
 * cohérence une base où certaines colonnes ont été ajoutées manuellement sans
 * que le journal Drizzle ait avancé.
 */

ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "activity_type" text DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "machine_name" text;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "machine_model" text;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "resistance" double precision;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "average_watts" double precision;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "average_heart_rate_bpm" integer;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD COLUMN IF NOT EXISTS "incline_percent" double precision;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "gender" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "age_years" integer;--> statement-breakpoint

UPDATE "cardio_entries" SET "activity_type" = 'other' WHERE "activity_type" IS NULL;--> statement-breakpoint
ALTER TABLE "cardio_entries" ALTER COLUMN "activity_type" SET DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "cardio_entries" ALTER COLUMN "activity_type" SET NOT NULL;--> statement-breakpoint

DO $$
DECLARE
  target record;
  actual_type text;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('exercises', 'last_used'),
      ('logged_sets', 'timestamp'),
      ('recovery_checkins', 'date'),
      ('workout_sessions', 'date'),
      ('workout_sessions', 'start_time'),
      ('workout_sessions', 'end_time'),
      ('workout_templates', 'created_at')
    ) AS columns_to_convert(table_name, column_name)
  LOOP
    SELECT columns.data_type
      INTO actual_type
      FROM information_schema.columns AS columns
     WHERE columns.table_schema = 'public'
       AND columns.table_name = target.table_name
       AND columns.column_name = target.column_name;

    IF actual_type = 'timestamp without time zone' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamp with time zone USING %I AT TIME ZONE ''UTC''',
        target.table_name,
        target.column_name,
        target.column_name
      );
    ELSIF actual_type IS DISTINCT FROM 'timestamp with time zone' THEN
      RAISE EXCEPTION 'Type inattendu pour %.%: %', target.table_name, target.column_name, actual_type;
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint

ALTER TABLE "recovery_checkins" ALTER COLUMN "took_creatine" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "took_creatine" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "protein_target_met" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "protein_target_met" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "sleep_hours" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "sleep_hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "had_alcohol" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ALTER COLUMN "had_alcohol" DROP NOT NULL;--> statement-breakpoint

UPDATE "user_settings"
   SET "gender" = 'male', "age_years" = 26
 WHERE "id" = 'singleton';--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cardio_entries'::regclass
       AND conname = 'cardio_entries_activity_type_check'
  ) THEN
    ALTER TABLE "cardio_entries" ADD CONSTRAINT "cardio_entries_activity_type_check"
      CHECK ("activity_type" IN ('running', 'rowing', 'cycling', 'swimming', 'elliptical', 'stairs', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cardio_entries'::regclass
       AND conname = 'cardio_entries_metrics_check'
  ) THEN
    ALTER TABLE "cardio_entries" ADD CONSTRAINT "cardio_entries_metrics_check" CHECK (
      "duration_seconds" > 0 AND "duration_seconds" <= 86400
      AND ("level" IS NULL OR "level" BETWEEN 0 AND 100)
      AND ("resistance" IS NULL OR "resistance" BETWEEN 0 AND 1000)
      AND ("distance_km" IS NULL OR "distance_km" BETWEEN 0 AND 1000)
      AND ("average_watts" IS NULL OR "average_watts" BETWEEN 0 AND 3000)
      AND ("average_heart_rate_bpm" IS NULL OR "average_heart_rate_bpm" BETWEEN 20 AND 260)
      AND ("incline_percent" IS NULL OR "incline_percent" BETWEEN -30 AND 100)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.user_settings'::regclass
       AND conname = 'user_settings_profile_check'
  ) THEN
    ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_profile_check" CHECK (
      ("gender" IS NULL OR "gender" IN ('male', 'female'))
      AND ("age_years" IS NULL OR "age_years" BETWEEN 10 AND 120)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.recovery_checkins'::regclass
       AND conname = 'recovery_checkins_values_check'
  ) THEN
    ALTER TABLE "recovery_checkins" ADD CONSTRAINT "recovery_checkins_values_check" CHECK (
      "sleep_hours" IS NULL OR "sleep_hours" BETWEEN 0 AND 24
    );
  END IF;
END
$$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "recovery_checkins_date_unique"
  ON "recovery_checkins" USING btree ("date");--> statement-breakpoint
DROP INDEX IF EXISTS "recovery_checkins_date_idx";
