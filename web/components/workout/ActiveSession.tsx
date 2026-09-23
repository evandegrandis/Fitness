"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveSession, deleteSession, upsertExercise } from "@/lib/db/actions";
import { enqueue, flush, pendingCount } from "@/lib/sync/outbox";
import { defaultOutboxHandlers } from "@/lib/sync/handlers";
import { writeThrough } from "@/lib/sync/write-through";
import { useSyncStatus } from "@/lib/sync/status";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import { SessionHeader } from "./SessionHeader";
import { ExerciseList } from "./ExerciseList";
import { RestTimer } from "./RestTimer";
import { UndoToast } from "./UndoToast";
import { AchievementOverlay } from "./AchievementOverlay";
import { ExercisePicker } from "./ExercisePicker";
import { EditSetSheet } from "./EditSetSheet";
import { SupersetLinkBanner } from "./SupersetLinkBanner";
import { FinisherPromptBanner } from "./FinisherPromptBanner";
import { LevelUpOverlay } from "./LevelUpOverlay";
import { CardioSection } from "./CardioSection";
import { cardioNudge, cardioProgress } from "@/lib/engines/cardio";

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
  const settings = useWorkoutStore((s) => s.settings);
  const cardioIntent = useWorkoutStore((s) => s.cardioIntent);
  const consumeCardioIntent = useWorkoutStore((s) => s.consumeCardioIntent);
  // Rappelle POURQUOI, au moment où Evan décide s'il en fait : c'est la fin de séance qui compte,
  // pas un écran de statistiques consulté après coup.
  const cardioHint = cardioNudge(
    cardioProgress(history, settings.weeklyCardioMinutesGoal ?? undefined, new Date(), session)
  );
  const upsertExerciseInCatalog = useWorkoutStore((s) => s.upsertExerciseInCatalog);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ loggedExerciseId: string; set: LoggedSet } | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    () => latestActiveExerciseId(session)
  );

  const setSyncStatus = useSyncStatus((s) => s.setStatus);
  const setPending = useSyncStatus((s) => s.setPending);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef<Promise<void>>(Promise.resolve());
  const finishing = useRef(false);

  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

  // Empreinte stable de toute la topologie persistée : sets, ordre et groupes.
  // Un simple lien/détachement de superset doit lui aussi déclencher l'autosave.
  const setFingerprint = session.exercises
    .map(
      (e) =>
        `${e.id}@${e.orderIndex}:${e.supersetGroupId ?? "-"}:` +
        e.sets
          .map(
            (s) =>
              `${s.id}=${s.weight}x${s.reps}:${s.setType}:${s.completed ? 1 : 0}:r${s.supersetRoundIndex ?? "-"}:` +
              `plan=${s.suggestedWeight ?? "-"}x${s.suggestedReps ?? "-"}:${s.suggestedSetType ?? "-"}:` +
              `pred=${s.predictedRepsAtActualWeight ?? "-"}:mode=${s.suggestionMode ?? "-"}:engine=${s.suggestionEngineVersion ?? "-"}:` +
              `logical=${s.logicalSetId ?? "-"}:${s.setTechnique ?? "-"}:reasons=${(s.suggestionReasonCodes ?? []).join("+")}`
          )
          .join(",")
    )
    .join("|") +
    `#groups:${session.supersetGroups
      .map((group) => `${group.id}@${group.orderIndex}=${group.memberOrder.join(",")}`)
      .join("|")}` +
    `#cardio:${(session.cardioEntries ?? [])
      .map(
        (entry) =>
          `${entry.id}=${entry.activityType}:${entry.activityName}:${entry.machineName}:${entry.machineModel}:` +
          `${entry.durationSeconds}:${entry.level}:${entry.resistance}:${entry.distanceKm}:` +
          `${entry.averageWatts}:${entry.averageHeartRateBpm}:${entry.inclinePercent}`
      )
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
    setSyncStatus(isOffline() ? "offline" : "saving");
    const snapshot = session;
    saveTimer.current = setTimeout(() => {
      const task = saveInFlight.current
        .catch(() => undefined)
        .then(async () => {
          if (finishing.current) return;
          try {
            // Une active a la même garantie que la séance finale : hors-ligne ou si Neon échoue,
            // son dernier snapshot rejoint l'outbox (dédoublonnée par session.id) au lieu de vivre
            // uniquement dans localStorage jusqu'au bouton Terminer.
            await writeThrough(
              { kind: "session", session: snapshot },
              () => saveSession(snapshot, false)
            );
            const pending = pendingCount();
            setPending(pending);
            if (!finishing.current) {
              setSyncStatus(pending === 0 ? "saved" : isOffline() ? "offline" : "error");
            }
          } catch {
            if (!finishing.current) setSyncStatus(isOffline() ? "offline" : "error");
          }
        });
      saveInFlight.current = task;
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFingerprint]);

  // L'intention ne vaut que pour l'ouverture : consommée au montage, elle ne rouvre pas le
  // formulaire à chaque rendu ni après un reload.
  useEffect(() => {
    if (cardioIntent) consumeCardioIntent();
  }, [cardioIntent, consumeCardioIntent]);

  const handleFinish = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    finishing.current = true;

    // Une sauvegarde active déjà partie sur le réseau doit finir AVANT l'upsert final. Sinon sa
    // réponse peut arriver après et ressusciter la séance avec `isActive=true`/un ancien snapshot.
    await saveInFlight.current.catch(() => undefined);
    const beforeFinish = useWorkoutStore.getState();

    // Séance vide → on jette et on nettoie la base (au cas où un autosave l'a écrite).
    if (session.exercises.every((e) => !e.sets.some((set) => set.completed)) && (session.cardioEntries?.length ?? 0) === 0) {
      const id = session.id;
      discard();
      try {
        await writeThrough({ kind: "session_delete", sessionId: id }, () => deleteSession(id));
        setPending(pendingCount());
        setSyncStatus(isOffline() ? "offline" : "saved");
      } catch {
        // Si même la persistance locale de la suppression échoue, ne prétend pas avoir jeté la
        // séance : restaure-la pour qu'aucune copie autosavée ne devienne un orphelin invisible.
        useWorkoutStore.setState(beforeFinish);
        finishing.current = false;
        setSyncStatus("error");
      }
      return;
    }

    const result = finish();
    if (!result) {
      finishing.current = false;
      return;
    }

    // La séance n'est retirée de l'écran qu'une fois sa copie locale vérifiée.
    // En cas d'échec de persistance, on restaure exactement l'état pré-finish.
    try {
      enqueue({ kind: "session", session: result.session });
      setPending(pendingCount());
    } catch {
      useWorkoutStore.setState(beforeFinish);
      finishing.current = false;
      setSyncStatus("error");
      return;
    }
    onFinished(result);

    if (isOffline()) {
      setSyncStatus("offline");
      return;
    }
    setSyncStatus("saving");
    try {
      const remaining = await flush(defaultOutboxHandlers);
      setPending(remaining);
      setSyncStatus(remaining === 0 ? "saved" : isOffline() ? "offline" : "error");
    } catch {
      setSyncStatus("error");
    }
  };

  /**
   * Crée un exercice depuis le seul nom tapé, puis l'ajoute à la séance.
   *
   * Volontairement minimal : en salle, Evan doit pouvoir logger sa série tout de suite. Les
   * réglages fins (muscles, incrément, plage de reps) se font après coup dans l'éditeur — sans
   * cette porte de sortie, un exercice absent du catalogue lui faisait perdre le travail fait.
   */
  const handleCreateExercise = async (name: string): Promise<string | null> => {
    const exercise: Exercise = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: "",
      setPatternMode: "straight",
      repTargetMin: settings.defaultRepTargetMin,
      repTargetMax: settings.defaultRepTargetMax,
      smallestIncrement: settings.defaultSmallestIncrement,
      isFavorite: false,
      createdByUser: true,
      sortOrder: 0,
      suggestedRestSeconds: settings.defaultRestTimerSeconds,
      machineSetting: "",
      setupNotes: "",
      benchmarkLow: null,
      benchmarkHigh: null,
      fatigueClass: "medium",
      progressionPolicy: null,
      voluntaryRepCap: 0,
      // Aucun muscle deviné : une supposition tirée du nom fausserait la couverture. Un profil
      // connu est repris à l'enregistrement (`withKnownMuscleProfile`) ; sinon la carte affiche
      // `MissingMusclesNotice` tant que le profil manque, avec les exercices ressemblants à un tap.
      muscleMappings: [],
      lastUsed: null,
      movementPattern: null,
      resistanceProfile: null,
      // Pas de repère de niveau : les barèmes externes ne valent pas pour une machine guidée,
      // dont la charge affichée dépend du bras de levier.
      strengthStandardKey: null,
      benchmarkUnit: null,
    };

    upsertExerciseInCatalog(exercise);
    handlePickExercise(exercise.id);
    try {
      await writeThrough({ kind: "exercise_upsert", exercise }, () => upsertExercise(exercise));
    } catch {
      // Hors-ligne : l'exercice vit déjà dans le store, l'outbox le rejouera.
    }
    return exercise.id;
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
      <SessionHeader
        session={session}
        onFinish={handleFinish}
        onFocusExercise={setExpandedExerciseId}
      />

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

      <CardioSection entries={session.cardioEntries ?? []} openByDefault={cardioIntent} hint={cardioHint} />

      <RestTimer />
      <UndoToast />
      <AchievementOverlay />
      <SupersetLinkBanner />
      <FinisherPromptBanner />
      <LevelUpOverlay />

      <ExercisePicker
        open={pickerOpen || replaceTarget !== null}
        onClose={() => {
          setPickerOpen(false);
          setReplaceTarget(null);
        }}
        catalog={catalog}
        onPick={handlePickExercise}
        onCreate={handleCreateExercise}
        // À l'AJOUT, un exercice déjà présent reste proposé : un finisher se greffe
        // souvent sur un mouvement déjà travaillé (HSPU en fin de séance), et le
        // modèle gère nativement deux blocs de même `exerciseId` (cf. `duplicateExercise`).
        // Au REMPLACEMENT en revanche, viser un exercice déjà dans la séance ferait
        // perdre le bloc remplacé au profit d'un doublon : on garde le filtre.
        excludeIds={replaceTarget !== null ? session.exercises.map((e) => e.exerciseId) : undefined}
        history={history}
        goals={goals}
      />

      <EditSetSheet target={editTarget} onClose={() => setEditTarget(null)} />
    </main>
  );
}
