import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseBackup } from "@/lib/models/backup";
import { BenchmarkUnit, fatigueClassFromRaw, MovementPattern, ResistanceProfile } from "@/lib/models/enums";
import type {
  BenchmarkUnit as BenchmarkUnitT,
  MovementPattern as MovementPatternT,
  ResistanceProfile as ResistanceProfileT,
} from "@/lib/models/enums";
import type {
  AllData,
} from "@/lib/db/queries";
import {
  sessionsNewestFirst,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleMapping,
  type WorkoutSession,
} from "@/lib/models/types";
import type { MuscleGroup } from "@/lib/models/muscles";

/**
 * Construit le jeu de données complet (33 séances) à partir des deux fichiers
 * JSON : le backup officiel + les 13 séances récentes. Utilisé comme fallback
 * local de développement quand aucune DATABASE_URL n'est configurée (jamais en production),
 * pour que l'app soit pleinement utilisable sans DB. La logique reflète
 * `scripts/seed.ts` (source unique à unifier en intégration).
 */

interface RecentExercise {
  name: string;
  sets: [number, number][];
}
interface RecentSession {
  date: string;
  exercises: RecentExercise[];
}
interface RecentNewExercise {
  name: string;
  category: string;
  setPatternMode: string;
  repTargetMin: number;
  repTargetMax: number;
  smallestIncrement: number;
  suggestedRestSeconds: number;
  fatigueClass: string;
  isFavorite?: boolean;
  muscleMappings: { muscleGroup: string; coefficient: number }[];
  /** VARIATION_CYCLING_SPEC §5 — optionnel : absent -> null (dégradation gracieuse, §9). */
  movementPattern?: string | null;
  /** VARIATION_CYCLING_SPEC §5.2 (P2.1) — optionnel, absent partout ici -> null (seed par défaut null). */
  resistanceProfile?: string | null;
  /** BENCHMARK_LEVEL_SPEC.md §1 (P3.1) — optionnel, absent -> null (dégradation gracieuse, §9). */
  strengthStandardKey?: string | null;
  benchmarkUnit?: string | null;
}
interface RecentFile {
  newExercises: RecentNewExercise[];
  sessions: RecentSession[];
}

/** Même règle de repli que `mappers.ts::asMovementPattern` / `scripts/seed.ts::resolveMovementPattern`. */
function resolveMovementPattern(raw: string | null | undefined): MovementPatternT | null {
  if (!raw) return null;
  const values = Object.values(MovementPattern) as string[];
  return values.includes(raw) ? (raw as MovementPatternT) : null;
}

/** Même règle de repli que `mappers.ts::asResistanceProfile` / `scripts/seed.ts::resolveResistanceProfile`. */
function resolveResistanceProfile(raw: string | null | undefined): ResistanceProfileT | null {
  if (!raw) return null;
  const values = Object.values(ResistanceProfile) as string[];
  return values.includes(raw) ? (raw as ResistanceProfileT) : null;
}

/** Même règle de repli que `mappers.ts::asBenchmarkUnit` / `scripts/seed.ts::resolveBenchmarkUnit`. */
function resolveBenchmarkUnit(raw: string | null | undefined): BenchmarkUnitT | null {
  if (!raw) return null;
  const values = Object.values(BenchmarkUnit) as string[];
  return values.includes(raw) ? (raw as BenchmarkUnitT) : null;
}

function buildNewExercise(data: RecentNewExercise, sortOrder: number): Exercise {
  return {
    id: crypto.randomUUID(),
    name: data.name,
    category: data.category,
    setPatternMode: data.setPatternMode as Exercise["setPatternMode"],
    repTargetMin: data.repTargetMin,
    repTargetMax: data.repTargetMax,
    smallestIncrement: data.smallestIncrement,
    isFavorite: data.isFavorite ?? false,
    createdByUser: true,
    sortOrder,
    suggestedRestSeconds: data.suggestedRestSeconds,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: fatigueClassFromRaw(data.fatigueClass),
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings: data.muscleMappings.map(
      (m): MuscleMapping => ({
        muscleGroup: m.muscleGroup as MuscleGroup,
        coefficient: m.coefficient,
      }),
    ),
    lastUsed: null,
    movementPattern: resolveMovementPattern(data.movementPattern),
    resistanceProfile: resolveResistanceProfile(data.resistanceProfile),
    strengthStandardKey: data.strengthStandardKey ?? null,
    benchmarkUnit: resolveBenchmarkUnit(data.benchmarkUnit),
  };
}

function resolveRecentSession(
  session: RecentSession,
  byName: Map<string, Exercise>,
): WorkoutSession {
  const date = new Date(`${session.date}T18:00:00Z`);
  // Durée inconnue (transcription papier sans horaires) → endTime null : on
  // n'invente pas de durée. La séance reste "terminée" (isActive=false).
  const endTime: Date | null = null;

  const exercises: LoggedExercise[] = session.exercises.map((ex, orderIndex) => {
    const catalogEx = byName.get(ex.name);
    if (!catalogEx) {
      throw new Error(`Exercice non résolu dans recent_sessions: "${ex.name}"`);
    }
    const sets: LoggedSet[] = ex.sets.map(([weight, reps], slot) => ({
      id: crypto.randomUUID(),
      weight,
      reps,
      setType: "work",
      timestamp: date,
      setSlotIndex: slot,
      completed: true,
      supersetRoundIndex: null,
    }));
    return {
      id: crypto.randomUUID(),
      orderIndex,
      notes: "",
      exerciseId: catalogEx.id,
      exerciseName: catalogEx.name,
      sets,
      supersetGroupId: null,
      // VARIATION_CYCLING_SPEC §5.3 (P2.1) — pas de trace de capture 1-tap dans ce fallback local.
      plateauWeakPoint: null,
    };
  });

  return {
    id: crypto.randomUUID(),
    date,
    startTime: date,
    endTime,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
    cardioEntries: [],
  };
}

export function buildFullDataset(backupJson: unknown, recentJson: unknown): AllData {
  const backup = parseBackup(backupJson);
  const recent = recentJson as RecentFile;

  const catalog = [...backup.exercises];
  const byName = new Map<string, Exercise>();
  catalog.forEach((e) => byName.set(e.name, e));

  recent.newExercises.forEach((data, i) => {
    if (byName.has(data.name)) return;
    const ex = buildNewExercise(data, catalog.length + i);
    catalog.push(ex);
    byName.set(ex.name, ex);
  });

  const recentSessions = recent.sessions.map((s) => resolveRecentSession(s, byName));
  const activeSession = backup.sessions.find((session) => session.isActive) ?? null;
  const sessions = sessionsNewestFirst([
    ...backup.sessions.filter((session) => !session.isActive),
    ...recentSessions,
  ]);

  return {
    exercises: catalog,
    sessions,
    activeSession,
    goals: backup.goals,
    settings: backup.settings,
    templates: backup.templates,
    recoveryCheckins: [],
  };
}

export async function loadFullDatasetFromDisk(): Promise<AllData> {
  const dir = path.join(process.cwd(), "data");
  const [backupRaw, recentRaw] = await Promise.all([
    readFile(path.join(dir, "jeera_backup.json"), "utf8"),
    readFile(path.join(dir, "recent_sessions.json"), "utf8"),
  ]);
  return buildFullDataset(JSON.parse(backupRaw), JSON.parse(recentRaw));
}
