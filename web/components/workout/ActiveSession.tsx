"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveSession, deleteSession } from "@/lib/db/actions";
import { enqueue, flush, pendingCount } from "@/lib/sync/outbox";
import { useSyncStatus } from "@/lib/sync/status";
import type { LoggedSet, WorkoutSession } from "@/lib/models/types";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import { SessionHeader } from "./SessionHeader";
import { ExerciseList } from "./ExerciseList";
import { RestTimer } from "./RestTimer";
import { UndoToast } from "./UndoToast";
import { AchievementOverlay } from "./AchievementOverlay";
import { ExercisePicker } from "./ExercisePicker";
import { EditSetSheet } from "./EditSetSheet";
import { SupersetLinkBanner } from "./SupersetLinkBanner";
import { CardioSection } from "./CardioSection";

/** Carte à garder ouverte lorsqu'une séance active est restaurée. */
function latestActiveExerciseId(session: WorkoutSession): string | null {
  let latest: { exerciseId: string; timestampMs: number } | null = null;

  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      const timestampMs = set.timestamp.getTime();
      if (!latest || timestampMs > latest.timestampMs) {
        latest = { exerciseId: exercise.id, timestampMs };
      }
    }
  }

  return latest?.exerciseId ?? null;
}

/** Écran de séance active : liste d'exercices, timer de repos, actions. */
export function ActiveSession({
  session,
  onFinished,
}: {
  session: WorkoutSession;
  onFinished: (result: { session: WorkoutSession; snapshot: FinishedWorkoutSnapshot }) => void;
}) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const goals = useWorkoutStore((s) => s.goals);
  const finish = useWorkoutStore((s) => s.finish);
  const discard = useWorkoutStore((s) => s.discard);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const replaceExercise = useWorkoutStore((s) => s.replaceExercise);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ loggedExerciseId: string; set: LoggedSet } | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    () => latestActiveExerciseId(session)
  );

  const setSyncStatus = useSyncStatus((s) => s.setStatus);
  const setPending = useSyncStatus((s) => s.setPending);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);

  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

  // Empreinte STABLE des sets : ne change QUE quand un set est ajouté/édité/
  // supprimé (pas à chaque changement de référence de `session`).
  const setFingerprint = session.exercises
    .map((e) => `${e.id}:${e.sets.map((s) => `${s.id}=${s.weight}x${s.reps}:${s.setType}:${s.completed ? 1 : 0}`).join(",")}`)
    .join("|") +
    `#cardio:${(session.cardioEntries ?? [])
      .map((entry) => `${entry.id}=${entry.activityName}:${entry.durationSeconds}:${entry.level}:${entry.distanceKm}`)
      .join(",")}`;
  const totalSetsCount = session.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const totalCardioCount = session.cardioEntries?.length ?? 0;

  // AUTOSAVE (offline-first) : la séance en cours vit TOUJOURS en local
  // (localStorage via persist) — jamais perdue à la salle, même sans réseau.
  // On tente en plus une écriture base best-effort ~800 ms après un changement.
  // Le statut est HONNÊTE : "offline" si pas de réseau, jamais un faux "saved".
  useEffect(() => {
    if (finishing.current || (totalSetsCount === 0 && totalCardioCount === 0)) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (isOffline()) {
      setSyncStatus("offline");
      return;
    }
    setSyncStatus("saving");
    const snapshot = session;
    saveTimer.current = setTimeout(async () => {
      try {
        await saveSession(snapshot, false);
        setSyncStatus("saved");
      } catch {
        setSyncStatus(isOffline() ? "offline" : "error");
      }
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFingerprint]);

  const handleFinish = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Séance vide → on jette et on nettoie la base (au cas où un autosave l'a écrite).
    if (session.exercises.every((e) => e.sets.length === 0) && (session.cardioEntries?.length ?? 0) === 0) {
      finishing.current = true;
      const id = session.id;
      discard();
      try {
        await deleteSession(id);
      } catch {
        /* best-effort */
      }
      return;
    }

    finishing.current = true;
    const result = finish();
    if (!result) {
      finishing.current = false;
      return;
    }

    // OFFLINE-FIRST : la séance finie est mise en FILE LOCALE d'abord (opération
    // localStorage, ne peut PAS échouer) → jamais perdue, même sans réseau.
    // On affiche le bilan immédiatement, puis on tente de synchroniser.
    enqueue(result.session);
    setPending(pendingCount());
    onFinished(result);

    if (isOffline()) {
      setSyncStatus("offline");
      return;
    }
    setSyncStatus("saving");
    const remaining = await flush(saveSession);
    setPending(remaining);
    setSyncStatus(remaining === 0 ? "saved" : isOffline() ? "offline" : "error");
  };

  const handlePickExercise = (exerciseId: string) => {
    if (replaceTarget) {
      replaceExercise(replaceTarget, exerciseId);
      setExpandedExerciseId(replaceTarget);
      setReplaceTarget(null);
    } else {
      const previousIds = new Set(session.exercises.map((exercise) => exercise.id));
      addExercise(exerciseId);
      const added = useWorkoutStore
        .getState()
        .active?.exercises.find((exercise) => !previousIds.has(exercise.id));
      setExpandedExerciseId(added?.id ?? null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-28 pt-6">
      <SessionHeader session={session} onFinish={handleFinish} />

      <ExerciseList
        session={session}
        onEditSet={(loggedExerciseId, set) => setEditTarget({ loggedExerciseId, set })}
        onReplace={setReplaceTarget}
        expandedExerciseId={expandedExerciseId}
        onExpandedExerciseChange={setExpandedExerciseId}
        onAddExercise={() => {
          setReplaceTarget(null);
          setPickerOpen(true);
        }}
      />

      <CardioSection entries={session.cardioEntries ?? []} />

      <RestTimer />
      <UndoToast />
      <AchievementOverlay />
      <SupersetLinkBanner />

      <ExercisePicker
        open={pickerOpen || replaceTarget !== null}
        onClose={() => {
          setPickerOpen(false);
          setReplaceTarget(null);
        }}
        catalog={catalog}
        onPick={handlePickExercise}
        excludeIds={session.exercises.map((e) => e.exerciseId)}
        history={history}
        goals={goals}
      />

      <EditSetSheet target={editTarget} onClose={() => setEditTarget(null)} />
    </main>
  );
}
