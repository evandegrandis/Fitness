CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"set_pattern_mode" text DEFAULT 'straight' NOT NULL,
	"rep_target_min" integer DEFAULT 8 NOT NULL,
	"rep_target_max" integer DEFAULT 12 NOT NULL,
	"smallest_increment" double precision DEFAULT 2.5 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_by_user" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"suggested_rest_seconds" integer DEFAULT 120 NOT NULL,
	"machine_setting" text DEFAULT '' NOT NULL,
	"setup_notes" text DEFAULT '' NOT NULL,
	"benchmark_low" double precision,
	"benchmark_high" double precision,
	"fatigue_class" text DEFAULT 'medium' NOT NULL,
	"progression_policy" text,
	"voluntary_rep_cap" integer DEFAULT 0 NOT NULL,
	"last_used" timestamp
);
--> statement-breakpoint
CREATE TABLE "logged_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"exercise_id" text NOT NULL,
	"exercise_name" text DEFAULT '' NOT NULL,
	"superset_group_id" text
);
--> statement-breakpoint
CREATE TABLE "logged_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"logged_exercise_id" text NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"set_type" text DEFAULT 'work' NOT NULL,
	"timestamp" timestamp NOT NULL,
	"set_slot_index" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"superset_round_index" integer
);
--> statement-breakpoint
CREATE TABLE "muscle_goals" (
	"muscle_parent" text PRIMARY KEY NOT NULL,
	"weekly_goal_sets" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muscle_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"muscle_group" text NOT NULL,
	"coefficient" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"took_creatine" boolean DEFAULT false NOT NULL,
	"protein_target_met" boolean DEFAULT false NOT NULL,
	"sleep_hours" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superset_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"member_order" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"exercise_name" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"target_sets" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"uses_kilograms" boolean DEFAULT true NOT NULL,
	"default_smallest_increment" double precision DEFAULT 2.5 NOT NULL,
	"default_rest_timer_seconds" integer DEFAULT 120 NOT NULL,
	"default_rep_target_min" integer DEFAULT 8 NOT NULL,
	"default_rep_target_max" integer DEFAULT 12 NOT NULL,
	"user_name" text DEFAULT 'Evan' NOT NULL,
	"superset_rest_seconds" integer DEFAULT 180 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"template_name" text
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_superset_group_id_superset_groups_id_fk" FOREIGN KEY ("superset_group_id") REFERENCES "public"."superset_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_logged_exercise_id_logged_exercises_id_fk" FOREIGN KEY ("logged_exercise_id") REFERENCES "public"."logged_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muscle_mappings" ADD CONSTRAINT "muscle_mappings_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superset_groups" ADD CONSTRAINT "superset_groups_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logged_exercises_session_id_idx" ON "logged_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "logged_exercises_superset_group_id_idx" ON "logged_exercises" USING btree ("superset_group_id");--> statement-breakpoint
CREATE INDEX "logged_sets_logged_exercise_id_idx" ON "logged_sets" USING btree ("logged_exercise_id");--> statement-breakpoint
CREATE INDEX "muscle_mappings_exercise_id_idx" ON "muscle_mappings" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "recovery_checkins_date_idx" ON "recovery_checkins" USING btree ("date");--> statement-breakpoint
CREATE INDEX "superset_groups_session_id_idx" ON "superset_groups" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "template_exercises_template_id_idx" ON "template_exercises" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_date_idx" ON "workout_sessions" USING btree ("date");