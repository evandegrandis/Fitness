ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "strength_standard_key" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "benchmark_unit" text;
