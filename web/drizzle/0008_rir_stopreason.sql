ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "reported_rir" integer;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "stop_reason" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.logged_sets'::regclass
       AND conname = 'logged_sets_reported_rir_check'
  ) THEN
    ALTER TABLE "logged_sets"
      ADD CONSTRAINT "logged_sets_reported_rir_check"
      CHECK ("reported_rir" IS NULL OR ("reported_rir" >= 0 AND "reported_rir" <= 4));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.logged_sets'::regclass
       AND conname = 'logged_sets_stop_reason_check'
  ) THEN
    ALTER TABLE "logged_sets"
      ADD CONSTRAINT "logged_sets_stop_reason_check"
      CHECK ("stop_reason" IS NULL OR "stop_reason" IN ('muscular', 'technique', 'pain', 'equipment'));
  END IF;
END $$;
