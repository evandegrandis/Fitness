ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "resistance_profile" text;--> statement-breakpoint
ALTER TABLE "logged_exercises" ADD COLUMN IF NOT EXISTS "plateau_weak_point" text;
