"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { displayedRecordSetIDs } from "@/lib/engines/records";
import {
  orderedSets,
  sessionsNewestFirst,
  type LoggedExercise,
  type LoggedSet,
} from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { SessionDetailHeader } from "@/components/history/SessionDetailHeader";
import { SessionExerciseBlock, SessionSupersetBlock } from "@/components/history/SessionExerciseBlock";
import { SessionCardioBlock } from "@/components/history/SessionCardioBlock";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);

  const session = useMemo(() => history.find((s) => s.id === params.id), [history, params.id]);
  const exerciseById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  const recordSetIdsByLoggedExerciseId = useMemo(() => {
    const result = new Map<string, Set<string>>();
    if (!session) return result;
    // Chronologique (plus ancien en premier) jusqu'à et y compris cette séance.
    // La date civile seule ne suffit pas : une autre séance plus tardive le même
    // jour ne doit jamais entrer dans les records affichés ici.
    const allChronological = sessionsNewestFirst(history).reverse();
    const targetIndex = allChronological.findIndex((candidate) => candidate.id === session.id);
    const chronological = allChronological.slice(0, targetIndex + 1);

    for (const logged of session.exercises) {
      const exercise = exerciseById.get(logged.exerciseId);
      if (!exercise) continue;
      const setsForExercise: LoggedSet[] = [];
      for (const s of chronological) {
        for (const le of s.exercises) {
          if (le.exerciseId === logged.exerciseId) {
            setsForExercise.push(...orderedSets(le));
          }
        }
      }
      result.set(logged.id, displayedRecordSetIDs(logged, setsForExercise, exercise));
    }
    return result;
  }, [session, history, exerciseById]);

  if (!hasHydratedStorage) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-28 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <button
          type="button"
          onClick={() => router.push("/historique")}
          className="flex items-center gap-1 text-sm text-[--color-fg-muted]"
        >
          <ChevronLeft size={16} /> Retour
        </button>
        <div className="glass glass-card mt-4 text-center text-sm text-[--color-fg-muted]">
          Séance introuvable : elle a peut-être été supprimée.
        </div>
      </main>
    );
  }

  const ordered = session.exercises
    .filter((exercise) => exercise.sets.some((set) => set.completed))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const blocks = buildBlocks(ordered, session.supersetGroups);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-8">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/historique")}
          className="flex items-center gap-1 text-sm text-[--color-fg-muted]"
        >
          <ChevronLeft size={16} /> Historique
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <SessionDetailHeader session={session} exercises={catalog} />

        {blocks.map((block) =>
          block.kind === "solo" ? (
            <SessionExerciseBlock
              key={block.logged.id}
              logged={block.logged}
              exercise={exerciseById.get(block.logged.exerciseId)}
              recordSetIds={recordSetIdsByLoggedExerciseId.get(block.logged.id) ?? new Set()}
            />
          ) : (
            <SessionSupersetBlock
              key={block.groupId}
              members={block.members}
              exerciseById={exerciseById}
              recordSetIdsByExerciseId={recordSetIdsByLoggedExerciseId}
            />
          )
        )}

        <SessionCardioBlock entries={session.cardioEntries ?? []} />
      </div>
    </main>
  );
}

type Block =
  | { kind: "solo"; logged: LoggedExercise }
  | { kind: "superset"; groupId: string; members: LoggedExercise[] };

/** Regroupe les exercices ordonnés en blocs solo / superset, dans l'ordre d'apparition. */
function buildBlocks(ordered: LoggedExercise[], supersetGroups: { id: string; memberOrder: string[] }[]): Block[] {
  const groupById = new Map(supersetGroups.map((g) => [g.id, g]));
  const seenGroups = new Set<string>();
  const blocks: Block[] = [];

  for (const logged of ordered) {
    if (logged.supersetGroupId && groupById.has(logged.supersetGroupId)) {
      if (seenGroups.has(logged.supersetGroupId)) continue;
      seenGroups.add(logged.supersetGroupId);
      const group = groupById.get(logged.supersetGroupId)!;
      const byId = new Map(ordered.map((e) => [e.id, e] as [string, LoggedExercise]));
      const members = group.memberOrder.map((id) => byId.get(id)).filter((e): e is LoggedExercise => e !== undefined);
      blocks.push({ kind: "superset", groupId: group.id, members });
    } else {
      blocks.push({ kind: "solo", logged });
    }
  }

  return blocks;
}
