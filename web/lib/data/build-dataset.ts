import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseBackup } from "@/lib/models/backup";
import { fatigueClassFromRaw } from "@/lib/models/enums";
import type {
  AllData,
} from "@/lib/db/queries";
import type {
  Exercise,
  LoggedExercise,
  LoggedSet,
  MuscleMapping,
  WorkoutSession,
} from "@/lib/models/types";
import type { MuscleGroup } from "@/lib/models/muscles";

/**
 * Construit le jeu de données complet (33 séances) à partir des deux fichiers
 * JSON : le backup officiel + les 13 séances récentes. Utilisé comme fallback
 * local quand aucune DATABASE_URL n'est configurée (dev / avant provisioning),
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
}
interface RecentFile {
  newExercises: RecentNewExercise[];
  sessions: RecentSession[];
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
  const sessions = [...backup.sessions, ...recentSessions].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );

  return {
    exercises: catalog,
    sessions,
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
