"use client";

import { Link2, Star } from "lucide-react";
import { setTypeShortLabel } from "@/lib/models/enums";
import { orderedSets, type Exercise, type LoggedExercise, type LoggedSet } from "@/lib/models/types";
import { cn } from "@/lib/utils";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

function SetLine({
  set,
  slot,
  isRecord,
}: {
  set: LoggedSet;
  slot: number;
  isRecord: boolean;
}) {
  const typeLabel = setTypeShortLabel[set.setType];
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2">
      <span className="tnum w-5 shrink-0 text-center text-xs text-[--color-fg-faint]">{slot}</span>
      {set.supersetRoundIndex != null && (
        <span className="pill shrink-0 bg-white/8 text-[0.62rem]">R{set.supersetRoundIndex}</span>
      )}
      <span className="tnum flex-1 text-sm font-semibold text-[--color-fg]">
        {set.weight > 0 ? `${cleanWeight(set.weight)} kg` : "BW"} × {set.reps}
      </span>
      {typeLabel && <span className="pill shrink-0 bg-white/8 text-[0.62rem]">{typeLabel}</span>}
      {isRecord && <Star size={14} className="shrink-0 text-amber-300" fill="currentColor" />}
    </div>
  );
}

function ExerciseSetsList({
  logged,
  exercise,
  recordSetIds,
}: {
  logged: LoggedExercise;
  exercise: Exercise | undefined;
  recordSetIds: Set<string>;
}) {
  const sets = orderedSets(logged);
  return (
    <div>
      <p className="text-sm font-semibold text-[--color-fg]">{logged.exerciseName}</p>
      {logged.notes && <p className="mt-0.5 text-xs text-[--color-fg-faint]">{logged.notes}</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {sets.map((set, i) => (
          <SetLine key={set.id} set={set} slot={i + 1} isRecord={recordSetIds.has(set.id)} />
        ))}
      </div>
      {!exercise && <p className="mt-1 text-[0.68rem] text-[--color-fg-faint]">Exercice supprimé du catalogue</p>}
    </div>
  );
}

/** Bloc d'un exercice standalone dans le détail de séance. */
export function SessionExerciseBlock({
  logged,
  exercise,
  recordSetIds,
}: {
  logged: LoggedExercise;
  exercise: Exercise | undefined;
  recordSetIds: Set<string>;
}) {
  return (
    <div className="glass glass-card">
      <ExerciseSetsList logged={logged} exercise={exercise} recordSetIds={recordSetIds} />
    </div>
  );
}

/** Bloc d'un groupe superset : icône lien + noms des membres + nb rounds, puis chaque exercice membre. */
export function SessionSupersetBlock({
  members,
  exerciseById,
  recordSetIdsByExerciseId,
}: {
  members: LoggedExercise[];
  exerciseById: Map<string, Exercise>;
  recordSetIdsByExerciseId: Map<string, Set<string>>;
}) {
  const rounds = members.reduce((max, m) => {
    const maxRound = orderedSets(m).reduce((r, s) => Math.max(r, s.supersetRoundIndex ?? 0), 0);
    return Math.max(max, maxRound);
  }, 0);

  return (
    <div className={cn("glass glass-card border-l-2", "border-l-[--accent]")}>
      <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
        <Link2 size={13} style={{ color: "var(--accent)" }} />
        <span className="truncate">{members.map((m) => m.exerciseName).join(" + ")}</span>
        <span className="shrink-0 pill bg-white/8">{rounds} round{rounds > 1 ? "s" : ""}</span>
      </div>
      <div className="flex flex-col gap-4">
        {members.map((logged) => (
          <ExerciseSetsList
            key={logged.id}
            logged={logged}
            exercise={exerciseById.get(logged.exerciseId)}
            recordSetIds={recordSetIdsByExerciseId.get(logged.id) ?? new Set()}
          />
        ))}
      </div>
    </div>
  );
}
