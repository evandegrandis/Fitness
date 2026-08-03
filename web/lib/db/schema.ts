/**
 * Schéma Drizzle (PostgreSQL) miroir des types du domaine (`lib/models/types.ts`).
 * Les enums (setPatternMode, fatigueClass, setType, muscleGroup, etc.) sont
 * stockés en `text` — la validation de valeur se fait côté application via
 * les unions TypeScript de `lib/models/enums.ts` / `lib/models/muscles.ts`,
 * pas via un enum Postgres natif (plus simple à faire évoluer).
 *
 * IDs : `text` (on garde les UUID string tels qu'exportés par l'app iOS,
 * pas de génération d'UUID côté Postgres).
 * Dates : `timestamp` en mode `date` (renvoie un objet `Date` JS).
 */

import { relations, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
  lastUsed: timestamp("last_used", { mode: "date" }),
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
    date: timestamp("date", { mode: "date" }).notNull(),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }),
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
    activityName: text("activity_name").notNull().default(""),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    level: integer("level"),
    distanceKm: doublePrecision("distance_km"),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (table) => [index("cardio_entries_session_id_idx").on(table.sessionId)]
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
    timestamp: timestamp("timestamp", { mode: "date" }).notNull(),
    setSlotIndex: integer("set_slot_index").notNull().default(0),
    completed: boolean("completed").notNull().default(true),
    supersetRoundIndex: integer("superset_round_index"),
  },
  (table) => [index("logged_sets_logged_exercise_id_idx").on(table.loggedExerciseId)]
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
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
export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey().default("singleton"),
  usesKilograms: boolean("uses_kilograms").notNull().default(true),
  defaultSmallestIncrement: doublePrecision("default_smallest_increment").notNull().default(2.5),
  defaultRestTimerSeconds: integer("default_rest_timer_seconds").notNull().default(120),
  defaultRepTargetMin: integer("default_rep_target_min").notNull().default(8),
  defaultRepTargetMax: integer("default_rep_target_max").notNull().default(12),
  userName: text("user_name").notNull().default("Evan"),
  supersetRestSeconds: integer("superset_rest_seconds").notNull().default(180),
  bodyWeightKg: doublePrecision("body_weight_kg"),
});

// ---------------------------------------------------------------------------
// recovery_checkins
// ---------------------------------------------------------------------------

export const recoveryCheckins = pgTable(
  "recovery_checkins",
  {
    id: text("id").primaryKey(),
    date: timestamp("date", { mode: "date" }).notNull(),
    tookCreatine: boolean("took_creatine").notNull().default(false),
    proteinTargetMet: boolean("protein_target_met").notNull().default(false),
    sleepHours: doublePrecision("sleep_hours").notNull().default(0),
    hadAlcohol: boolean("had_alcohol").notNull().default(false),
  },
  (table) => [index("recovery_checkins_date_idx").on(table.date)]
);

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------

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
