/**
 * Schéma Drizzle (PostgreSQL) miroir des types du domaine (`lib/models/types.ts`).
 * Les enums (setPatternMode, fatigueClass, setType, muscleGroup, etc.) sont
 * stockés en `text` — la validation de valeur se fait côté application via
 * les unions TypeScript de `lib/models/enums.ts` / `lib/models/muscles.ts`,
 * pas via un enum Postgres natif (plus simple à faire évoluer).
 *
 * IDs : `text` (on garde les UUID string tels qu'exportés par l'app iOS,
 * pas de génération d'UUID côté Postgres).
 * Dates métier : `timestamptz` en mode `date` (instants UTC, affichage dans le
 * fuseau du client). Les valeurs historiques sans suffixe contiennent déjà
 * l'instant UTC ; la migration les interprète donc explicitement en UTC.
 */

import { relations, sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// exercises
// ---------------------------------------------------------------------------

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  setPatternMode: text("set_pattern_mode").notNull().default("straight"),
  repTargetMin: integer("rep_target_min").notNull().default(8),
  repTargetMax: integer("rep_target_max").notNull().default(12),
  smallestIncrement: doublePrecision("smallest_increment").notNull().default(2.5),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdByUser: boolean("created_by_user").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  suggestedRestSeconds: integer("suggested_rest_seconds").notNull().default(120),
  machineSetting: text("machine_setting").notNull().default(""),
  setupNotes: text("setup_notes").notNull().default(""),
  benchmarkLow: doublePrecision("benchmark_low"),
  benchmarkHigh: doublePrecision("benchmark_high"),
  fatigueClass: text("fatigue_class").notNull().default("medium"),
  progressionPolicy: text("progression_policy"),
  voluntaryRepCap: integer("voluntary_rep_cap").notNull().default(0),
  lastUsed: timestamp("last_used", { mode: "date", withTimezone: true }),
  /** VARIATION_CYCLING_SPEC §5 — nullable (dégradation gracieuse si non tagué, cf. §9). */
  movementPattern: text("movement_pattern"),
  /** VARIATION_CYCLING_SPEC §5.2 (P2.1) — nullable, seed par défaut null (cf. §9). */
  resistanceProfile: text("resistance_profile"),
  /** BENCHMARK_LEVEL_SPEC.md §1 (P3.1) — clé dans `data/strength_standards_corrected.json`, nullable. */
  strengthStandardKey: text("strength_standard_key"),
  /** BENCHMARK_LEVEL_SPEC.md §1 (P3.1) — "load"|"reps"|"reps_and_load", nullable. */
  benchmarkUnit: text("benchmark_unit"),
});

export const exercisesRelations = relations(exercises, ({ many }) => ({
  muscleMappings: many(muscleMappings),
  loggedExercises: many(loggedExercises),
  templateExercises: many(templateExercises),
}));

// ---------------------------------------------------------------------------
// muscle_mappings
// ---------------------------------------------------------------------------

export const muscleMappings = pgTable(
  "muscle_mappings",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleGroup: text("muscle_group").notNull(),
    coefficient: doublePrecision("coefficient").notNull(),
  },
  (table) => [index("muscle_mappings_exercise_id_idx").on(table.exerciseId)]
);

export const muscleMappingsRelations = relations(muscleMappings, ({ one }) => ({
  exercise: one(exercises, {
    fields: [muscleMappings.exerciseId],
    references: [exercises.id],
  }),
}));

// ---------------------------------------------------------------------------
// workout_sessions
// ---------------------------------------------------------------------------

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: text("id").primaryKey(),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    startTime: timestamp("start_time", { mode: "date", withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { mode: "date", withTimezone: true }),
    notes: text("notes").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    templateName: text("template_name"),
  },
  (table) => [index("workout_sessions_date_idx").on(table.date)]
);

export const workoutSessionsRelations = relations(workoutSessions, ({ many }) => ({
  loggedExercises: many(loggedExercises),
  supersetGroups: many(supersetGroups),
  cardioEntries: many(cardioEntries),
}));

// ---------------------------------------------------------------------------
// cardio_entries
// ---------------------------------------------------------------------------

export const cardioEntries = pgTable(
  "cardio_entries",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull().default("other"),
    activityName: text("activity_name").notNull().default(""),
    machineName: text("machine_name"),
    machineModel: text("machine_model"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    level: integer("level"),
    resistance: doublePrecision("resistance"),
    distanceKm: doublePrecision("distance_km"),
    averageWatts: doublePrecision("average_watts"),
    averageHeartRateBpm: integer("average_heart_rate_bpm"),
    inclinePercent: doublePrecision("incline_percent"),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (table) => [
    index("cardio_entries_session_id_idx").on(table.sessionId),
    check(
      "cardio_entries_activity_type_check",
      sql`${table.activityType} IN ('running', 'rowing', 'cycling', 'swimming', 'elliptical', 'stairs', 'other')`
    ),
    check(
      "cardio_entries_metrics_check",
      sql`${table.durationSeconds} > 0 AND ${table.durationSeconds} <= 86400
        AND (${table.level} IS NULL OR ${table.level} BETWEEN 0 AND 100)
        AND (${table.resistance} IS NULL OR ${table.resistance} BETWEEN 0 AND 1000)
        AND (${table.distanceKm} IS NULL OR ${table.distanceKm} BETWEEN 0 AND 1000)
        AND (${table.averageWatts} IS NULL OR ${table.averageWatts} BETWEEN 0 AND 3000)
        AND (${table.averageHeartRateBpm} IS NULL OR ${table.averageHeartRateBpm} BETWEEN 20 AND 260)
        AND (${table.inclinePercent} IS NULL OR ${table.inclinePercent} BETWEEN -30 AND 100)`
    ),
  ]
);

export const cardioEntriesRelations = relations(cardioEntries, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [cardioEntries.sessionId],
    references: [workoutSessions.id],
  }),
}));

// ---------------------------------------------------------------------------
// logged_exercises
// ---------------------------------------------------------------------------

export const loggedExercises = pgTable(
  "logged_exercises",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    notes: text("notes").notNull().default(""),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    exerciseName: text("exercise_name").notNull().default(""),
    supersetGroupId: text("superset_group_id").references(() => supersetGroups.id, {
      onDelete: "set null",
    }),
    /**
     * VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — capture 1-tap « où ça a calé ? » à l'entrée en
     * plateau. Nullable : SEULE donnée utilisateur réellement nouvelle persistée par cette
     * feature (le reste du moteur reste dérivé à la volée, jamais persisté, invariant HARDENED §0.2).
     */
    plateauWeakPoint: text("plateau_weak_point"),
  },
  (table) => [
    index("logged_exercises_session_id_idx").on(table.sessionId),
    index("logged_exercises_superset_group_id_idx").on(table.supersetGroupId),
  ]
);

export const loggedExercisesRelations = relations(loggedExercises, ({ one, many }) => ({
  session: one(workoutSessions, {
    fields: [loggedExercises.sessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, {
    fields: [loggedExercises.exerciseId],
    references: [exercises.id],
  }),
  supersetGroup: one(supersetGroups, {
    fields: [loggedExercises.supersetGroupId],
    references: [supersetGroups.id],
  }),
  sets: many(loggedSets),
}));

// ---------------------------------------------------------------------------
// logged_sets
// ---------------------------------------------------------------------------

export const loggedSets = pgTable(
  "logged_sets",
  {
    id: text("id").primaryKey(),
    loggedExerciseId: text("logged_exercise_id")
      .notNull()
      .references(() => loggedExercises.id, { onDelete: "cascade" }),
    weight: doublePrecision("weight").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    setType: text("set_type").notNull().default("work"),
    timestamp: timestamp("timestamp", { mode: "date", withTimezone: true }).notNull(),
    setSlotIndex: integer("set_slot_index").notNull().default(0),
    completed: boolean("completed").notNull().default(true),
    supersetRoundIndex: integer("superset_round_index"),
    /** Snapshot de la suggestion vue avant validation, pour calibrage futur du moteur. */
    suggestedWeight: doublePrecision("suggested_weight"),
    suggestedReps: integer("suggested_reps"),
    predictedRepsAtActualWeight: integer("predicted_reps_at_actual_weight"),
    suggestedSetType: text("suggested_set_type"),
    suggestionMode: text("suggestion_mode"),
    suggestionReasonCodes: jsonb("suggestion_reason_codes").$type<string[]>().notNull().default([]),
    suggestionEngineVersion: text("suggestion_engine_version"),
    /** Plusieurs lignes peuvent représenter une seule série physiologique. */
    logicalSetId: text("logical_set_id"),
    setTechnique: text("set_technique"),
    /** RIR rapporté (0..4 ; 4 = « 4+ »). NULL = non rapporté. Cf. oui.rtf #1/#2. */
    reportedRir: integer("reported_rir"),
    /** Raison d'arrêt si ≠ échec musculaire ; NULL = arrêt normal. Cf. oui.rtf #7. */
    stopReason: text("stop_reason"),
  },
  (table) => [
    index("logged_sets_logged_exercise_id_idx").on(table.loggedExerciseId),
    index("logged_sets_logical_set_id_idx").on(table.logicalSetId),
    check(
      "logged_sets_set_technique_check",
      sql`${table.setTechnique} IS NULL OR ${table.setTechnique} IN ('completion', 'drop_set', 'rest_pause')`
    ),
    check(
      "logged_sets_reported_rir_check",
      sql`${table.reportedRir} IS NULL OR (${table.reportedRir} >= 0 AND ${table.reportedRir} <= 4)`
    ),
    check(
      "logged_sets_stop_reason_check",
      sql`${table.stopReason} IS NULL OR ${table.stopReason} IN ('muscular', 'technique', 'pain', 'equipment')`
    ),
  ]
);

export const loggedSetsRelations = relations(loggedSets, ({ one }) => ({
  loggedExercise: one(loggedExercises, {
    fields: [loggedSets.loggedExerciseId],
    references: [loggedExercises.id],
  }),
}));

// ---------------------------------------------------------------------------
// superset_groups
// ---------------------------------------------------------------------------

export const supersetGroups = pgTable(
  "superset_groups",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    /** Ordre stable des LoggedExercise.id membres — string[] en JSONB. */
    memberOrder: jsonb("member_order").$type<string[]>().notNull().default([]),
  },
  (table) => [index("superset_groups_session_id_idx").on(table.sessionId)]
);

export const supersetGroupsRelations = relations(supersetGroups, ({ one, many }) => ({
  session: one(workoutSessions, {
    fields: [supersetGroups.sessionId],
    references: [workoutSessions.id],
  }),
  members: many(loggedExercises),
}));

// ---------------------------------------------------------------------------
// muscle_goals
// ---------------------------------------------------------------------------

export const muscleGoals = pgTable("muscle_goals", {
  /** Un objectif par parent — le rawValue du parent est la clé, comme côté Swift (`muscleGroupRaw`). */
  muscleParent: text("muscle_parent").primaryKey(),
  weeklyGoalSets: doublePrecision("weekly_goal_sets").notNull(),
});

// ---------------------------------------------------------------------------
// workout_templates / template_exercises
// ---------------------------------------------------------------------------

export const workoutTemplates = pgTable("workout_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const workoutTemplatesRelations = relations(workoutTemplates, ({ many }) => ({
  templateExercises: many(templateExercises),
}));

export const templateExercises = pgTable(
  "template_exercises",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseName: text("exercise_name").notNull().default(""),
    orderIndex: integer("order_index").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
  },
  (table) => [index("template_exercises_template_id_idx").on(table.templateId)]
);

export const templateExercisesRelations = relations(templateExercises, ({ one }) => ({
  template: one(workoutTemplates, {
    fields: [templateExercises.templateId],
    references: [workoutTemplates.id],
  }),
}));

// ---------------------------------------------------------------------------
// user_settings
// ---------------------------------------------------------------------------

/** Table single-row (id fixe "singleton") — miroir du UserSettings Swift. */
export const userSettings = pgTable(
  "user_settings",
  {
    id: text("id").primaryKey().default("singleton"),
    usesKilograms: boolean("uses_kilograms").notNull().default(true),
    defaultSmallestIncrement: doublePrecision("default_smallest_increment").notNull().default(2.5),
    defaultRestTimerSeconds: integer("default_rest_timer_seconds").notNull().default(120),
    defaultRepTargetMin: integer("default_rep_target_min").notNull().default(8),
    defaultRepTargetMax: integer("default_rep_target_max").notNull().default(12),
    userName: text("user_name").notNull().default("Evan"),
    supersetRestSeconds: integer("superset_rest_seconds").notNull().default(180),
    bodyWeightKg: doublePrecision("body_weight_kg"),
    gender: text("gender"),
    ageYears: integer("age_years"),
  },
  (table) => [
    check(
      "user_settings_profile_check",
      sql`(${table.gender} IS NULL OR ${table.gender} IN ('male', 'female'))
        AND (${table.ageYears} IS NULL OR ${table.ageYears} BETWEEN 10 AND 120)`
    ),
  ]
);

// ---------------------------------------------------------------------------
// recovery_checkins
// ---------------------------------------------------------------------------

export const recoveryCheckins = pgTable(
  "recovery_checkins",
  {
    id: text("id").primaryKey(),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    tookCreatine: boolean("took_creatine"),
    proteinTargetMet: boolean("protein_target_met"),
    sleepHours: doublePrecision("sleep_hours"),
    hadAlcohol: boolean("had_alcohol"),
  },
  (table) => [
    uniqueIndex("recovery_checkins_date_unique").on(table.date),
    check(
      "recovery_checkins_values_check",
      sql`${table.sleepHours} IS NULL OR ${table.sleepHours} BETWEEN 0 AND 24`
    ),
  ]
);

// ---------------------------------------------------------------------------
// push_subscriptions
// ---------------------------------------------------------------------------

/**
 * Abonnements Web Push (notification de fin de repos). iOS gèle le JS de la page
 * écran éteint : seul un push serveur peut réveiller le SW pendant un repos.
 *
 * L'`endpoint` fourni par le navigateur est l'identité de l'abonnement — il sert
 * donc de clé primaire, ce qui rend le réabonnement naturellement idempotent.
 * Un abonnement expiré (410/404 au moment de l'envoi) est supprimé côté serveur.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------

export type PushSubscriptionRow = InferSelectModel<typeof pushSubscriptions>;
export type NewPushSubscriptionRow = InferInsertModel<typeof pushSubscriptions>;

export type ExerciseRow = InferSelectModel<typeof exercises>;
export type NewExerciseRow = InferInsertModel<typeof exercises>;

export type MuscleMappingRow = InferSelectModel<typeof muscleMappings>;
export type NewMuscleMappingRow = InferInsertModel<typeof muscleMappings>;

export type WorkoutSessionRow = InferSelectModel<typeof workoutSessions>;
export type NewWorkoutSessionRow = InferInsertModel<typeof workoutSessions>;

export type CardioEntryRow = InferSelectModel<typeof cardioEntries>;
export type NewCardioEntryRow = InferInsertModel<typeof cardioEntries>;

export type LoggedExerciseRow = InferSelectModel<typeof loggedExercises>;
export type NewLoggedExerciseRow = InferInsertModel<typeof loggedExercises>;

export type LoggedSetRow = InferSelectModel<typeof loggedSets>;
export type NewLoggedSetRow = InferInsertModel<typeof loggedSets>;

export type SupersetGroupRow = InferSelectModel<typeof supersetGroups>;
export type NewSupersetGroupRow = InferInsertModel<typeof supersetGroups>;

export type MuscleGoalRow = InferSelectModel<typeof muscleGoals>;
export type NewMuscleGoalRow = InferInsertModel<typeof muscleGoals>;

export type WorkoutTemplateRow = InferSelectModel<typeof workoutTemplates>;
export type NewWorkoutTemplateRow = InferInsertModel<typeof workoutTemplates>;

export type TemplateExerciseRow = InferSelectModel<typeof templateExercises>;
export type NewTemplateExerciseRow = InferInsertModel<typeof templateExercises>;

export type UserSettingsRow = InferSelectModel<typeof userSettings>;
export type NewUserSettingsRow = InferInsertModel<typeof userSettings>;

export type RecoveryCheckinRow = InferSelectModel<typeof recoveryCheckins>;
export type NewRecoveryCheckinRow = InferInsertModel<typeof recoveryCheckins>;
