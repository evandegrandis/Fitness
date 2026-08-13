ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggested_weight" double precision;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggested_reps" integer;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "predicted_reps_at_actual_weight" integer;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggested_set_type" text;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggestion_mode" text;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggestion_reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "suggestion_engine_version" text;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "logical_set_id" text;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "set_technique" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logged_sets_logical_set_id_idx" ON "logged_sets" USING btree ("logical_set_id");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.logged_sets'::regclass
       AND conname = 'logged_sets_set_technique_check'
  ) THEN
    ALTER TABLE "logged_sets"
      ADD CONSTRAINT "logged_sets_set_technique_check"
      CHECK ("set_technique" IS NULL OR "set_technique" IN ('completion', 'drop_set', 'rest_pause'));
  END IF;
END $$;
