"use client";

import { useState } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveSession } from "@/lib/db/actions";
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

/** Écran de séance active : liste d'exercices, timer de repos, actions. */
export function ActiveSession({ session }: { session: WorkoutSession }) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const finish = useWorkoutStore((s) => s.finish);
  const discard = useWorkoutStore((s) => s.discard);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const replaceExercise = useWorkoutStore((s) => s.replaceExercise);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [actionsTarget, setActionsTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ loggedExerciseId: string; set: LoggedSet } | null>(null);
  const [snapshot, setSnapshot] = useState<FinishedWorkoutSnapshot | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const handleFinish = () => {
    if (session.exercises.every((e) => e.sets.length === 0)) {
      discard();
      return;
    }
    const result = finish();
    if (!result) return;
    void saveSession(result.session);
    setSnapshot(result.snapshot);
    setSummaryOpen(true);
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
      <SessionHeader session={session} onFinish={handleFinish} />

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

      <ExercisePicker
        open={pickerOpen || replaceTarget !== null}
        onClose={() => {
          setPickerOpen(false);
          setReplaceTarget(null);
        }}
        catalog={catalog}
        onPick={handlePickExercise}
        excludeIds={session.exercises.map((e) => e.exerciseId)}
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
        onClose={() => {
          setSummaryOpen(false);
          setSnapshot(null);
        }}
      />
    </main>
  );
}
