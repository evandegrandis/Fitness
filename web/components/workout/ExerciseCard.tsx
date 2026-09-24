"use client";

import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Film, Flame, GripVertical, Link2, Repeat, TrendingDown, Trophy, Unlink } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { ExerciseGif } from "@/components/exercise/ExerciseGif";
import { hasExerciseGif } from "@/lib/data/exercise-gifs";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { allTimeRecordSet, displayedRecordSetIDs, isCalibrating, normalRecordSets, recordCalibration } from "@/lib/engines/records";
import { headlineSet, lastWorkSession, sameRankSet, staleAgeLabel } from "@/lib/engines/last-session";
import { machineMaxStatus } from "@/lib/engines/machine-max";
import { compositeSetBlocks, physiologicalSetUnits } from "@/lib/engines/set-structure";
import { useWorkoutStore } from "@/lib/store/workout";
import { orderedSets, type Exercise, type LoggedExercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";
import { SetRow } from "./SetRow";
import { SetEntry } from "./SetEntry";
import { MissingMusclesNotice } from "@/components/exercise/MissingMusclesNotice";
import { ExerciseEditorSheet } from "@/components/exercise/ExerciseEditorSheet";
import { useLongPress } from "@/lib/hooks/use-long-press";
import { cn } from "@/lib/utils";
import { SetType } from "@/lib/models/enums";
import { nextSupersetExerciseId, nextSupersetRoundIndex } from "@/lib/store/superset";
import { cleanWeight, formatLoad, formatDecimal } from "@/lib/format";

function supersetRoundLabel(session: WorkoutSession, loggedExercise: LoggedExercise): string | null {
  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) return null;
  const memberIdx = group.memberOrder.indexOf(loggedExercise.id) + 1;
  const round = nextSupersetRoundIndex(session, loggedExercise.id);
  if (memberIdx <= 0 || round === null) return null;
  return `SS · r${round} · ${memberIdx}/${group.memberOrder.length}`;
}

export function ExerciseCard({
  loggedExercise,
  exercise,
  session,
  expanded,
  onToggleExpanded,
  onBecameActive,
  onDuplicate,
  onEditSet,
  onReplace,
}: {
  loggedExercise: LoggedExercise;
  exercise: Exercise | undefined;
  session: WorkoutSession;
  expanded: boolean;
  onToggleExpanded: () => void;
  onBecameActive: (loggedExerciseId: string) => void;
  onDuplicate: () => void;
  onEditSet: (set: LoggedSet) => void;
  onReplace: (loggedExerciseId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loggedExercise.id });
  const [handleArmed, setHandleArmed] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  // Appui long sur le nom : réglages de l'exercice (fourchette, charge max, muscles…) sans quitter
  // la séance. Hors réseau, l'enregistrement part dans la file de synchronisation (saveExercise).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPress = useLongPress(() => setSettingsOpen(true));
  const logSet = useWorkoutStore((s) => s.logSet);
  const suggestion = useWorkoutStore((s) => s.suggestion);
  const warmupSuggestion = useWorkoutStore((s) => s.warmupSuggestion);
  const justHitRecord = useWorkoutStore((s) => s.justHitRecord);
  const history = useWorkoutStore((s) => s.history);
  // VARIATION_CYCLING_SPEC §8 — résout `suggestion.switchToVariantId` (un `Exercise.id` réel) en nom
  // affichable ; `SetEntry` reste découplé du store/catalogue (voir sa doc de prop).
  const catalog = useWorkoutStore((s) => s.catalog);
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);
  const detachFromSupersetGroup = useWorkoutStore((s) => s.detachFromSupersetGroup);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sets = orderedSets(loggedExercise);
  const finisherSets = sets.filter((set) => set.setType === SetType.finisher);
  const normalSets = sets.filter((set) => set.setType !== SetType.finisher);
  const workBlocks = compositeSetBlocks(normalSets, { increment: exercise?.smallestIncrement });
  const compositeBlocks = workBlocks.filter(
    (block) => block.sets.length > 1
  );
  const seriesNumberBySetId = new Map(
    workBlocks.flatMap((block, index) => block.sets.map((set) => [set.id, index + 1] as const))
  );
  const compositeByLeadId = new Map(compositeBlocks.map((block) => [block.leadSet.id, block]));
  const compositeContinuationIds = new Set(compositeBlocks.flatMap((block) => block.sets.slice(1).map((set) => set.id)));
  const effectiveCount = Math.round(
    physiologicalSetUnits(loggedExercise.sets, { increment: exercise?.smallestIncrement }) * 10
  ) / 10;
  const currentLastSet = sets.at(-1);
  const roundLabel = supersetRoundLabel(session, loggedExercise);
  const isArmed = armedSupersetExerciseId === loggedExercise.id;
  const armedExercise = session.exercises.find((candidate) => candidate.id === armedSupersetExerciseId);
  const targetGroup = session.supersetGroups.find((group) => group.id === loggedExercise.supersetGroupId);
  const armedGroup = session.supersetGroups.find((group) => group.id === armedExercise?.supersetGroupId);
  // Un AUTRE exercice est armé → cette carte devient une cible de liaison :
  // taper n'importe où dessus finalise le superset (agrandissement de cible).
  const isLinkTarget =
    armedExercise !== undefined &&
    !isArmed &&
    (targetGroup
      ? armedExercise.supersetGroupId === null && targetGroup.memberOrder.length < 4
      : loggedExercise.supersetGroupId === null && (!armedGroup || armedGroup.memberOrder.length < 4));

  // Dépend de `loggedExercise` (pas juste son id) pour recalculer après chaque set loggué.
  const currentSuggestion = useMemo(() => suggestion(loggedExercise.id), [suggestion, loggedExercise]);
  const currentWarmup = useMemo(() => warmupSuggestion(loggedExercise.id), [warmupSuggestion, loggedExercise]);
  const variantCandidateName = useMemo(
    () => (currentSuggestion.switchToVariantId ? catalog.find((e) => e.id === currentSuggestion.switchToVariantId)?.name ?? null : null),
    [currentSuggestion, catalog]
  );
  // VARIATION_CYCLING_SPEC §3/§8 — indice discret "progrès qui ralentit" : apparaît UNIQUEMENT sur
  // `slowing` (préemptif, avant `isPlateau` — qui a sa propre carte dans le bilan, pas ici), et
  // disparaît dès `progressing`/`plateaued`/`undefined` (v1, pas de calcul date-based — §9).
  const isSlowing = currentSuggestion.progressionState === "slowing";
  // Dernière vraie séance de travail (lib/engines/last-session.ts) : l'en-tête résume par la
  // meilleure série, le raccourci « dernier » reprend la série de même rang que la prochaine.
  const lastSession = useMemo(
    () => (exercise ? lastWorkSession(exercise, history) : null),
    [exercise, history]
  );
  const lastHeadline = lastSession ? headlineSet(lastSession) : null;
  const lastSessionAge = lastSession ? staleAgeLabel(lastSession, new Date()) : null;
  const completedLeadsToday = exercise ? normalRecordSets(orderedSets(loggedExercise), exercise).length : 0;
  const repeatSet = lastSession ? sameRankSet(lastSession, completedLeadsToday) : null;
  // Record réellement all-time, séance active comprise, pour donner le bon repère au moment
  // où l'utilisateur ouvre la carte et choisit sa prochaine charge.
  const allRecordSets = useMemo(() => {
    if (!exercise) return [];
    const historicalSets = history
      .filter((s) => !s.isActive)
      .flatMap((s) => s.exercises)
      .filter((e) => e.exerciseId === exercise.id)
      .flatMap((e) => e.sets);
    const activeSets = session.exercises
      .filter((candidate) => candidate.exerciseId === exercise.id)
      .flatMap((candidate) => candidate.sets);
    return [...historicalSets, ...activeSets];
  }, [exercise, history, session.exercises]);
  // Pendant l'étalonnage (première séance, records.ts), il n'y a pas encore de record à afficher :
  // « Record all-time » sur la toute première série d'une machine contredisait la règle.
  const allTimeRecord = useMemo(() => {
    if (!exercise) return undefined;
    if (isCalibrating(recordCalibration(allRecordSets, exercise), new Date())) return undefined;
    return allTimeRecordSet(exercise, allRecordSets);
  }, [exercise, allRecordSets]);
  // Objectif « maxer chaque machine » : où en est la pile, séance du jour comprise.
  const machineStatus = useMemo(
    () => (exercise && exercise.maxLoad ? machineMaxStatus(exercise, allRecordSets) : null),
    [exercise, allRecordSets]
  );
  const displayedRecordIds = useMemo(
    () => (exercise ? displayedRecordSetIDs(loggedExercise, allRecordSets, exercise) : new Set<string>()),
    [exercise, loggedExercise, allRecordSets]
  );
  const displayedRecordKind = (setId: string) =>
    displayedRecordIds.has(setId) ? justHitRecord[setId] : undefined;

  if (!exercise) return null;

  const isLinked = loggedExercise.supersetGroupId !== null;

  return (
    <div ref={setNodeRef} style={style}>
      <SwipeRow
        actions={[
          { label: "Dupliquer", icon: Copy, onClick: onDuplicate },
          { label: "Remplacer", icon: Repeat, onClick: () => onReplace(loggedExercise.id) },
        ]}
        onDelete={() => removeExercise(loggedExercise.id)}
      >
        <GlassCard
          className={cn(
            "flex flex-col",
            expanded ? "gap-3" : "gap-2 py-3",
            isArmed && "ring-1 ring-[color:var(--accent)]",
            isLinkTarget && "ring-1 ring-[color:#ff8a3d] animate-pulse cursor-pointer",
          )}
          {...(isLinkTarget
            ? {
                onClickCapture: (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSupersetLink(loggedExercise.id);
                },
              }
            : {})}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer select-none text-left [-webkit-touch-callout:none]"
              onClick={(event) => {
                // Un appui long vient d'ouvrir les réglages : ce relâchement ne doit pas replier la carte.
                if (longPress.consumeClick()) {
                  event.preventDefault();
                  return;
                }
                onToggleExpanded();
              }}
              onContextMenu={(event) => event.preventDefault()}
              {...longPress.handlers}
              aria-expanded={expanded}
              title="Appui long : réglages de l'exercice"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-display text-base font-bold text-[--color-fg]">{exercise.name}</span>
                {roundLabel && (
                  <span className="pill shrink-0" style={{ color: "#ff8a3d", background: "rgba(255,138,61,0.12)" }}>
                    <Link2 size={11} />
                    {roundLabel}
                  </span>
                )}
                {/* VARIATION_CYCLING_SPEC §3/§8 — indice discret "slowing" : préemptif, zéro bruit
                    tant que ça progresse (§8 "progressing : rien"), disparaît dès que retour à progressing. */}
                {isSlowing && (
                  <span className="pill shrink-0" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}>
                    <TrendingDown size={11} />
                    Progrès qui ralentit
                  </span>
                )}
              </span>
              {exercise.machineSetting && (
                <span className="block truncate text-xs text-[--color-fg-muted]">{exercise.machineSetting}</span>
              )}
              {lastHeadline && (
                <span className="block truncate text-xs text-[--color-fg-faint]">
                  Dernière séance{lastSessionAge ? ` (${lastSessionAge})` : ""} : {formatLoad(lastHeadline.weight)} × {lastHeadline.reps}
                </span>
              )}
            </button>
            <button
              type="button"
              {...attributes}
              {...listeners}
              data-drag-handle="true"
              onPointerDown={(e) => {
                setHandleArmed(true);
                listeners?.onPointerDown?.(e);
              }}
              onPointerUp={() => setHandleArmed(false)}
              onPointerLeave={() => setHandleArmed(false)}
              onPointerCancel={() => setHandleArmed(false)}
              className={cn(
                "shrink-0 grid h-8 w-8 touch-none place-items-center rounded-full text-[--color-fg-faint] transition",
                handleArmed ? "scale-90 cursor-grabbing text-[--color-fg]" : "cursor-grab"
              )}
              aria-label="Réordonner (appui maintenu)"
            >
              <GripVertical size={16} />
            </button>
            {hasExerciseGif(exercise.name) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGifOpen(true);
                }}
                aria-label={`Voir la démonstration de ${exercise.name}`}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-full text-[--color-fg-muted] transition active:scale-90"
              >
                <Film size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (armedSupersetExerciseId !== null && !isArmed) {
                  if (isLinkTarget) handleSupersetLink(loggedExercise.id);
                  return;
                }
                if (isLinked) {
                  detachFromSupersetGroup(loggedExercise.id);
                } else {
                  handleSupersetLink(loggedExercise.id);
                }
              }}
              aria-label={
                isLinkTarget
                  ? "Ajouter au superset"
                  : isLinked
                    ? "Détacher du superset"
                    : "Lier en superset"
              }
              aria-pressed={isArmed}
              className={cn(
                "shrink-0 grid h-8 w-8 place-items-center rounded-full transition active:scale-90",
                isLinked || isArmed ? "text-white" : "text-[--color-fg-muted]"
              )}
              style={
                isLinked || isArmed
                  ? { background: "rgba(255,138,61,0.22)", color: "#ff8a3d" }
                  : undefined
              }
            >
              {isLinked ? <Unlink size={16} /> : <Link2 size={16} />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                {exercise && exercise.muscleMappings.length === 0 && <MissingMusclesNotice exercise={exercise} />}
                {machineStatus && machineStatus.maxLoad !== null && (
                  <div
                    className="pill w-fit tnum"
                    style={machineStatus.maxed ? { color: "#fbbf24", background: "rgba(251,191,36,0.10)" } : undefined}
                  >
                    {machineStatus.maxed
                      ? `Machine maxée · ${cleanWeight(machineStatus.maxLoad)} kg`
                      : `Vers le max : ${cleanWeight(machineStatus.bestLoad)} / ${cleanWeight(machineStatus.maxLoad)} kg`}
                  </div>
                )}
                {allTimeRecord && (
                  <div className="pill w-fit" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.10)" }}>
                    <Trophy size={11} />
                    Record all-time · {allTimeRecord.weight > 0 ? `${cleanWeight(allTimeRecord.weight)}kg` : "PDC"} × {allTimeRecord.reps}
                  </div>
                )}
                {normalSets.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {normalSets.map((set) => {
                      if (compositeContinuationIds.has(set.id)) return null;
                      const block = compositeByLeadId.get(set.id);
                      if (!block) {
                        return <SetRow key={set.id} set={set} seriesNumber={seriesNumberBySetId.get(set.id)} isRecord={displayedRecordKind(set.id)} onTap={() => onEditSet(set)} />;
                      }
                      return (
                        <div key={set.id} className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.035] p-2">
                          <div className="mb-1.5 px-1 text-[0.68rem] font-semibold text-sky-200">
                            {block.kind === "completion" ? "Série complétée" : block.kind === "drop_set" ? "Drop set" : "Rest-pause"} · {block.totalReps} reps cumulées · {formatDecimal(block.effectiveSetUnits)} série{block.effectiveSetUnits === 1 ? "" : "s"} effective{block.effectiveSetUnits === 1 ? "" : "s"}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {block.sets.map((blockSet) => (
                              <SetRow
                                key={blockSet.id}
                                set={blockSet}
                                seriesNumber={seriesNumberBySetId.get(blockSet.id)}
                                isRecord={displayedRecordKind(blockSet.id)}
                                onTap={() => onEditSet(blockSet)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {finisherSets.length > 0 && (
                  <div className="rounded-2xl border border-rose-300/25 bg-rose-300/[0.045] p-2">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-rose-200">
                      <Flame size={12} />
                      Finisher · hors prévision
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {finisherSets.map((set) => (
                        <SetRow key={set.id} set={set} isRecord={displayedRecordKind(set.id)} onTap={() => onEditSet(set)} />
                      ))}
                    </div>
                  </div>
                )}
                <SetEntry
                  key={sets.length}
                  loggedExerciseId={loggedExercise.id}
                  exercise={exercise}
                  suggestion={currentSuggestion}
                  warmup={currentWarmup}
                  lastSessionSet={repeatSet}
                  variantCandidateName={variantCandidateName}
                  onLogSet={(input) => {
                    logSet(loggedExercise.id, input);
                    const updatedSession = useWorkoutStore.getState().active;
                    const updatedExercise = updatedSession?.exercises.find(
                      (candidate) => candidate.id === loggedExercise.id
                    );
                    const loggedSet = updatedExercise ? orderedSets(updatedExercise).at(-1) : undefined;
                    const advancesSuperset =
                      loggedSet?.setType === SetType.work ||
                      loggedSet?.setType === SetType.topSet ||
                      loggedSet?.setType === SetType.backoff;
                    const requiresImmediateCompletion = useWorkoutStore
                      .getState()
                      .suggestion(loggedExercise.id)
                      .reasonCodes.includes("logical_set_completion");
                    const nextId =
                      updatedSession && advancesSuperset && !requiresImmediateCompletion
                        ? nextSupersetExerciseId(updatedSession, loggedExercise.id)
                        : null;
                    onBecameActive(nextId ?? loggedExercise.id);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {!expanded && (
            <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-[--color-fg-faint]">
              <span className="truncate">
                {currentLastSet
                  ? `${effectiveCount} série${effectiveCount === 1 ? "" : "s"} effective${effectiveCount === 1 ? "" : "s"} · dernière ${currentLastSet.weight > 0 ? `${cleanWeight(currentLastSet.weight)}kg` : "PDC"} × ${currentLastSet.reps}${currentLastSet.setType === SetType.finisher ? " · finisher" : ""}`
                  : "À faire"}
                {exercise && exercise.muscleMappings.length === 0 && (
                  <span className="text-amber-200"> · aucun muscle</span>
                )}
              </span>
              {allTimeRecord && (
                <span className="shrink-0">
                  Record {allTimeRecord.weight > 0 ? `${cleanWeight(allTimeRecord.weight)}kg` : "PDC"} × {allTimeRecord.reps}
                </span>
              )}
            </div>
          )}
        </GlassCard>
      </SwipeRow>

      {/* La démo n'était atteignable que par Réglages > Exercices > édition, donc jamais au moment
          utile. Chargée uniquement à l'ouverture : rien ne pèse tant qu'on ne la demande pas. */}
      <Sheet open={gifOpen} onClose={() => setGifOpen(false)} ariaLabel={`Démonstration : ${exercise.name}`}>
        <h2 className="font-display text-lg font-bold text-[--color-fg]">{exercise.name}</h2>
        <div className="mt-3">
          <ExerciseGif exerciseName={exercise.name} />
        </div>
      </Sheet>

      {/* Appui long sur le nom de l'exercice : ses réglages, sans quitter la séance. */}
      <ExerciseEditorSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        exercise={exercise}
        allowDelete={false}
      />
    </div>
  );
}
