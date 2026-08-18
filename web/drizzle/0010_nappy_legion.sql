CREATE TABLE "body_weights" (
	"id" text PRIMARY KEY NOT NULL,
	"measured_on" timestamp with time zone NOT NULL,
	"weight_kg" double precision NOT NULL,
	CONSTRAINT "body_weights_weight_check" CHECK ("body_weights"."weight_kg" > 20 AND "body_weights"."weight_kg" < 400)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "training_phase" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "training_phase_started_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "body_weights_measured_on_unique" ON "body_weights" USING btree ("measured_on");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_training_phase_check" CHECK ("user_settings"."training_phase" IS NULL OR "user_settings"."training_phase" IN ('cut', 'maintain', 'bulk'));