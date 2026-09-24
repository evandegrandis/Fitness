ALTER TABLE "exercises" ADD COLUMN "profile_source" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equivalence_key" text;--> statement-breakpoint
-- Profils antérieurs au suivi : Barbis ne cartographie que les exercices créés à partir d'ici.
UPDATE "exercises" SET "profile_source" = 'legacy' WHERE "profile_source" IS NULL;
