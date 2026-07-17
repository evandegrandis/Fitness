"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveSession, deleteSession } from "@/lib/db/actions";
import type { LoggedSet, WorkoutSession } from "@/lib/models/types";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import { SessionHeader } from "./SessionHeader";
import { ExerciseList } from "./ExerciseList";
import { RestTimer } from "./RestTimer";
import { UndoToast } from "./UndoToast";
import { AchievementOverlay } from "./AchievementOverlay";
import { ExercisePicker } from "./ExercisePicker";
import { ExerciseActionsSheet } from "./ExerciseActionsSheet";
import { EditSetSheet } from "./EditSetSheet";
import { PostWorkoutSheet } from "./PostWorkoutSheet";
import { SupersetLinkBanner } from "./SupersetLinkBanner";

/** Écran de séance active : liste d'exercices, timer de repos, actions. */
export function ActiveSession({ session }: { session: WorkoutSession }) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const goals = useWorkoutStore((s) => s.goals);
  const finish = useWorkoutStore((s) => s.finish);
  const discard = useWorkoutStore((s) => s.discard);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const replaceExercise = useWorkoutStore((s) => s.replaceExercise);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [actionsTarget, setActionsTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ loggedExerciseId: string; set: LoggedSet } | null>(null);
  const [snapshot, setSnapshot] = useState<FinishedWorkoutSnapshot | null>(null);
  const [finishedSession, setFinishedSession] = useState<WorkoutSession | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);

  // AUTOSAVE : chaque modification de la séance (set validé/édité/supprimé) est
  // écrite en base après ~1,2 s (debounce). La séance n'est jamais "dans le
  // vent" — elle vit en base (Neon), pas seulement en localStorage.
  useEffect(() => {
    if (finishing.current) return;
    const hasSets = session.exercises.some((e) => e.sets.length > 0);
    if (!hasSets) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await saveSession(session);
        setSyncState("saved");
      } catch {
        setSyncState("error");
      }
    }, 1200);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [session]);

  const handleFinish = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Séance vide → on jette et on nettoie la base (au cas où un autosave l'a écrite).
    if (session.exercises.every((e) => e.sets.length === 0)) {
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
    setSnapshot(result.snapshot);
    setFinishedSession(result.session);
    setSummaryOpen(true);

    // Sauvegarde finale FIABLE (awaited + retry) : on ne perd pas une séance finie.
    setSyncState("saving");
    try {
      await saveSession(result.session);
      setSyncState("saved");
    } catch {
      try {
        await saveSession(result.session);
        setSyncState("saved");
      } catch {
        setSyncState("error");
      }
    }
  };

  const handlePickExercise = (exerciseId: string) => {
    if (replaceTarget) {
      replaceExercise(replaceTarget, exerciseId);
      setReplaceTarget(null);
    } else {
      addExercise(exerciseId);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-28 pt-6">
      <SessionHeader session={session} onFinish={handleFinish} syncState={syncState} />

      <ExerciseList
        session={session}
        onEditSet={(loggedExerciseId, set) => setEditTarget({ loggedExerciseId, set })}
        onOpenActions={setActionsTarget}
        onAddExercise={() => {
          setReplaceTarget(null);
          setPickerOpen(true);
        }}
      />

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

      <ExerciseActionsSheet
        loggedExerciseId={actionsTarget}
        onClose={() => setActionsTarget(null)}
        onReplace={(id) => {
          setActionsTarget(null);
          setReplaceTarget(id);
        }}
      />

      <EditSetSheet target={editTarget} onClose={() => setEditTarget(null)} />

      <PostWorkoutSheet
        open={summaryOpen}
        snapshot={snapshot}
        session={finishedSession}
        onClose={() => {
          setSummaryOpen(false);
          setSnapshot(null);
          setFinishedSession(null);
        }}
      />
    </main>
  );
}
