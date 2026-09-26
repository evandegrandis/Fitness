CREATE TABLE "row_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"row_key" text NOT NULL,
	"op" text NOT NULL,
	"old_row" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "row_history_op_check" CHECK ("row_history"."op" IN ('UPDATE', 'DELETE'))
);
--> statement-breakpoint
ALTER TABLE "body_weights" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "muscle_goals" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_checkins" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "row_history_row_idx" ON "row_history" USING btree ("table_name","row_key","changed_at");--> statement-breakpoint
CREATE INDEX "row_history_changed_at_idx" ON "row_history" USING btree ("changed_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Garde-fous de données (26/09/2026, DATA_SAFETY.md). Écrit à la main : Drizzle ne décrit ni
-- fonctions ni triggers. Tout ce qui suit vit dans la base : aucune PR ne peut l'oublier.
-- ---------------------------------------------------------------------------
-- 1) `updated_at` bouge dès que le contenu d'une ligne change, quel que soit l'écrivain (app,
--    Barbis, script). Les arguments listent les colonnes dénormalisées dont le changement ne
--    compte pas (`exercises.last_used`, recalculé à chaque séance ; `user_settings.body_weight_kg`,
--    recopié de la dernière pesée).
CREATE OR REPLACE FUNCTION jeera_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ignored text[] := coalesce(TG_ARGV, '{}'::text[]) || '{updated_at}'::text[];
BEGIN
  IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "workout_sessions" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "exercises" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at('last_used');
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "user_settings" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at('body_weight_kg');
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "muscle_goals" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "workout_templates" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "recovery_checkins" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON "body_weights" FOR EACH ROW EXECUTE FUNCTION jeera_touch_updated_at();
--> statement-breakpoint
-- 2) Journal : l'ancienne version de toute ligne écrasée ou supprimée va dans `row_history`.
--    Déclenché au COMMIT (trigger de contrainte différé) : une ligne supprimée puis réinsérée à
--    l'identique dans la même transaction (réécriture d'une séance) n'a rien perdu et n'y laisse
--    rien. Argument : la colonne de clé primaire.
CREATE OR REPLACE FUNCTION jeera_keep_row_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  key_column text := TG_ARGV[0];
  ignored text[] := '{updated_at,last_used}'::text[];
  previous jsonb := to_jsonb(OLD);
  present jsonb;
  new_id bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ignored) = (previous - ignored) THEN
      RETURN NULL;
    END IF;
  ELSE
    EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE t.%I = ($1).%I', TG_TABLE_SCHEMA, TG_TABLE_NAME, key_column, key_column)
      INTO present USING OLD;
    IF present IS NOT NULL AND (present - ignored) = (previous - ignored) THEN
      RETURN NULL;
    END IF;
  END IF;
  INSERT INTO row_history (table_name, row_key, op, old_row)
  VALUES (TG_TABLE_NAME, previous ->> key_column, CASE WHEN TG_OP = 'DELETE' AND present IS NULL THEN 'DELETE' ELSE 'UPDATE' END, previous)
  RETURNING id INTO new_id;
  -- Purge déterministe, tous les 1 000 ajouts : au-delà de 30 jours, les copies horaires de
  -- Cloudflare R2 prennent le relais.
  IF new_id % 1000 = 0 THEN
    DELETE FROM row_history WHERE changed_at < now() - interval '30 days';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "workout_sessions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "logged_exercises" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "logged_sets" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "superset_groups" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "cardio_entries" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "exercises" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "muscle_mappings" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "muscle_goals" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('muscle_parent');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "workout_templates" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "template_exercises" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "user_settings" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "recovery_checkins" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "body_weights" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER keep_row_history AFTER UPDATE OR DELETE ON "daily_activity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION jeera_keep_row_history('day');
--> statement-breakpoint
-- 3) Aucune table de données ne se vide en bloc.
CREATE OR REPLACE FUNCTION jeera_refuse_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE refusé sur % : les données de Jeera ne se vident jamais en bloc (web/DATA_SAFETY.md).', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['workout_sessions','logged_exercises','logged_sets','superset_groups','cardio_entries','exercises','muscle_mappings','muscle_goals','workout_templates','template_exercises','user_settings','recovery_checkins','body_weights','daily_activity','row_history'] LOOP
    EXECUTE format('CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION jeera_refuse_truncate()', name);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- 4) La copie horaire de Barbis (rôle `barbis_backup`, lecture seule) n'embarque pas le journal :
--    la suite des copies le contient déjà.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbis_backup') THEN
    REVOKE ALL ON "row_history" FROM barbis_backup;
  END IF;
END;
$$;
