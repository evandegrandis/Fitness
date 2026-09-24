"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { deleteExercise } from "@/lib/db/actions";
import { PermanentMutationError, writeThrough } from "@/lib/sync/write-through";
import {
  BENCHMARK_UNITS,
  benchmarkUnitDisplayName,
  FATIGUE_CLASSES,
  MOVEMENT_PATTERNS,
  movementPatternDisplayName,
  PROGRESSION_POLICIES,
  progressionPolicyDisplayName,
  RESISTANCE_PROFILES,
  resistanceProfileDisplayName,
  SET_PATTERN_MODES,
  setPatternModeDisplayName,
  type BenchmarkUnit,
  type FatigueClass,
  type MovementPattern,
  type ProgressionPolicy,
  type ResistanceProfile,
  type SetPatternMode,
} from "@/lib/models/enums";
import { LEAF_TO_PARENT, LEAVES_OF_PARENT, type MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleMapping } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { MuscleMappingEditor, mappingsToParentLevel } from "@/components/exercise/MuscleMappingEditor";
import { ExerciseGif } from "@/components/exercise/ExerciseGif";
import { listKnownStandards } from "@/lib/engines/benchmark";
import { withKnownMuscleProfile } from "@/lib/data/catalog-muscle-profiles";
import { saveExercise } from "@/lib/sync/save-exercise";
import { equivalentExercises } from "@/lib/engines/equivalence";

const FATIGUE_LABEL: Record<FatigueClass, string> = { heavy: "Lourd", medium: "Moyen", light: "Léger" };

const CONVENTION_LABEL: Record<"per_arm" | "total" | "added" | "reps", string> = {
  per_arm: "par bras",
  total: "total",
  added: "ajoutée au poids de corps",
  reps: "répétitions au poids de corps",
};

function parentMappingsToLeafMappings(parentMappings: [MuscleParent, number][]): MuscleMapping[] {
  return parentMappings.map(([parent, coefficient]) => ({
    // Feuille représentative : la première du parent (suffisant pour piloter
    // les moteurs côté web, qui agrègent via `aggregateCoefficient` = max des
    // feuilles d'un même parent).
    muscleGroup: LEAVES_OF_PARENT[parent][0],
    coefficient,
  }));
}

function emptyExercise(): Exercise {
  return {
    id: crypto.randomUUID(),
    name: "",
    category: "",
    setPatternMode: "straight",
    repTargetMin: 8,
    repTargetMax: 12,
    smallestIncrement: 2.5,
    isFavorite: false,
    createdByUser: true,
    sortOrder: 0,
    suggestedRestSeconds: 120,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: "medium",
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings: [],
    lastUsed: null,
    movementPattern: null,
    resistanceProfile: null,
    strengthStandardKey: null,
    benchmarkUnit: null,
  };
}

/**
 * Feuille de création/édition d'exercice.
 * - Création : nom, catégorie, SetPatternMode, reps min/max, incrément, mappings musculaires.
 * - Édition : ajoute favori, machine/notes, FatigueClass, ProgressionPolicy, cap reps, repos, suppression.
 *
 * Le contenu du formulaire n'est monté que lorsque la feuille est ouverte,
 * avec une `key` dérivée de l'exercice édité — cela réinitialise l'état local
 * du formulaire à chaque ouverture sans passer par un effet de
 * synchronisation (`open`/`exercise` -> `setDraft`).
 */
export function ExerciseEditorSheet({
  open,
  onClose,
  exercise,
  allowDelete = true,
}: {
  open: boolean;
  onClose: () => void;
  /** null = création. */
  exercise: Exercise | null;
  /** Faux en pleine séance : supprimer l'exercice en cours casserait la séance. */
  allowDelete?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} full>
      {open && (
        <ExerciseEditorForm key={exercise?.id ?? "new"} onClose={onClose} exercise={exercise} allowDelete={allowDelete} />
      )}
    </Sheet>
  );
}

function ExerciseEditorForm({
  onClose,
  exercise,
  allowDelete,
}: {
  onClose: () => void;
  exercise: Exercise | null;
  allowDelete: boolean;
}) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const catalogLength = catalog.length;
  const [draft, setDraft] = useState<Exercise>(() => exercise ?? emptyExercise());
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = exercise !== null;

  const parentMappings = mappingsToParentLevel(draft.muscleMappings, LEAF_TO_PARENT);
  // Rapprochement de machines (même exercice, autre marque) : posé par le nom ou par Barbis ;
  // « Délier » donne à l'exercice une famille à lui seul.
  const equivalents = isEditing ? equivalentExercises(draft, catalog) : [];
  // BENCHMARK_LEVEL_SPEC.md §4 (P3.4) — recalculé à chaque rendu (pas de useMemo : `listKnownStandards()`
  // relit un import JSON déjà en mémoire, coût négligeable, et reste toujours à jour si le fichier
  // gagne des entrées entre deux ouvertures de la feuille sans re-render forcé).
  const knownStandards = listKnownStandards();
  const selectedStandard = draft.strengthStandardKey
    ? knownStandards.find((s) => s.key === draft.strengthStandardKey)
    : undefined;

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    // Des muscles choisis ou modifiés à la main font foi : ni Barbis ni un profil copié ne les
    // remplaceront (PROFILE_SOURCE_RANK). Inchangés, ils gardent leur origine.
    const musclesEditedByHand =
      draft.muscleMappings.length > 0 &&
      JSON.stringify(draft.muscleMappings) !== JSON.stringify(exercise?.muscleMappings ?? []);
    const toSave: Exercise = withKnownMuscleProfile({
      ...draft,
      name: draft.name.trim(),
      category: draft.category.trim() || "Autre",
      sortOrder: isEditing ? draft.sortOrder : catalogLength,
      profileSource: musclesEditedByHand ? "user" : draft.profileSource ?? null,
    });
    // OFFLINE_PWA_SPEC §4 (P4.4) — catalogue local mis à jour immédiatement, écriture ou mise en
    // file, retour arrière si rien n'a été conservé : tout est dans `saveExercise`.
    try {
      await saveExercise(toSave);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de sécuriser cet exercice.");
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (!exercise) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const state = useWorkoutStore.getState();
    const referencedLocally =
      state.active?.exercises.some((logged) => logged.exerciseId === exercise.id) === true ||
      state.history.some((session) => session.exercises.some((logged) => logged.exerciseId === exercise.id));
    if (referencedLocally) {
      setError("Cet exercice est utilisé dans l'historique et doit rester au catalogue.");
      setConfirmingDelete(false);
      return;
    }
    setSaving(true);
    setError(null);
    useWorkoutStore.getState().removeExerciseFromCatalog(exercise.id);
    try {
      await writeThrough(
        { kind: "exercise_delete", exerciseId: exercise.id },
        async () => {
          const result = await deleteExercise(exercise.id);
          if (result === "referenced") {
            throw new PermanentMutationError(
              "Cet exercice est utilisé dans l'historique et doit rester au catalogue."
            );
          }
        }
      );
    } catch (cause) {
      if (!useWorkoutStore.getState().catalog.some((item) => item.id === exercise.id)) {
        useWorkoutStore.getState().upsertExerciseInCatalog(exercise);
      }
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cet exercice.");
      setSaving(false);
      setConfirmingDelete(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  return (
      <div className="flex h-full flex-col">
        <h2 className="font-display text-lg font-bold text-(--color-fg)">
          {isEditing ? "Modifier l'exercice" : "Nouvel exercice"}
        </h2>

        <div className="mt-4 flex-1 overflow-y-auto pb-6">
          <div className="flex flex-col gap-5">
            {/* Nom + favori */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Nom</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex. Développé couché"
                  className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
                />
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, isFavorite: !draft.isFavorite })}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
                      draft.isFavorite ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/10 bg-white/5 text-(--color-fg-faint)"
                    }`}
                    aria-label="Basculer favori"
                  >
                    ★
                  </button>
                )}
              </div>
            </div>

            {/* Démonstration animée (à la demande) — édition uniquement, sur le nom d'origine */}
            {isEditing && exercise && <ExerciseGif exerciseName={exercise.name} />}

            {/* Catégorie */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Catégorie</label>
              <input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="Ex. push, pull, legs…"
                className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
              />
            </div>

            {/* SetPatternMode */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Mode de sets</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {SET_PATTERN_MODES.map((mode: SetPatternMode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraft({ ...draft, setPatternMode: mode })}
                    className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                      draft.setPatternMode === mode ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                    }`}
                  >
                    {setPatternModeDisplayName[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/*
              MovementPattern (VARIATION_CYCLING_SPEC §5) — clé de carry-over pour la rotation de
              variation (§6). Éditable dès la création (comme SetPatternMode) pour que les nouveaux
              exercices ne restent pas non-tagués. "Non taggé" (null) est une option explicite : la
              sélection de variante retombe alors sur le recouvrement musculaire seul (§9), jamais
              de crash — mais on préfère taguer dès que possible.
            */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                Pattern de mouvement
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, movementPattern: null })}
                  className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                    draft.movementPattern === null ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                  }`}
                >
                  Non taggé
                </button>
                {MOVEMENT_PATTERNS.map((pattern: MovementPattern) => (
                  <button
                    key={pattern}
                    type="button"
                    onClick={() => setDraft({ ...draft, movementPattern: pattern })}
                    className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                      draft.movementPattern === pattern ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                    }`}
                  >
                    {movementPatternDisplayName[pattern]}
                  </button>
                ))}
              </div>
            </div>

            {/*
              ResistanceProfile (VARIATION_CYCLING_SPEC §5.2, P2.1) — où l'exercice est le plus dur
              dans l'amplitude de mouvement, sert à cibler le point faible mesuré (§6, `weakPointFit`).
              Éditable dès la création, même pattern que MovementPattern ci-dessus. "Non taggé" (null)
              reste l'option explicite : `weakPointFit` retombe alors neutre (§9), jamais de crash.
              Seed par défaut null partout (pas de tagging manuel des 29 exos, décision tracée en P2.1).
            */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                Profil de résistance
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, resistanceProfile: null })}
                  className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                    draft.resistanceProfile === null ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                  }`}
                >
                  Non taggé
                </button>
                {RESISTANCE_PROFILES.map((profile: ResistanceProfile) => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => setDraft({ ...draft, resistanceProfile: profile })}
                    className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                      draft.resistanceProfile === profile ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                    }`}
                  >
                    {resistanceProfileDisplayName[profile]}
                  </button>
                ))}
              </div>
            </div>

            {/*
              StrengthStandardKey (BENCHMARK_LEVEL_SPEC.md §4, P3.4) — clé dans
              `data/strength_standards_corrected.json`. Sélectionner un standard mappe AUTOMATIQUEMENT
              cet exercice dans la jauge (`BenchmarkGauge`, onglet Progrès) + le signal feu intra-séance
              (`SetEntry.tsx`), sans aucun autre changement : `unit` se met à jour seul depuis le JSON
              (source de vérité) ; `convention`/`isMachine` sont affichés à titre informatif (pas des
              champs `Exercise` séparés — ils vivent uniquement dans l'entrée JSON). "Aucun" (fallback
              manuel) laisse `benchmarkUnit` éditable pour un futur repère saisi à la main
              (`benchmarkLow`/`benchmarkHigh`, non consommé aujourd'hui — §1).
            */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                Standard StrengthLevel
              </label>
              <select
                value={draft.strengthStandardKey ?? ""}
                onChange={(e) => {
                  const key = e.target.value || null;
                  const entry = key ? knownStandards.find((s) => s.key === key) : undefined;
                  setDraft({
                    ...draft,
                    strengthStandardKey: key,
                    // Un standard JSON impose son unité (source de vérité) ; en repli manuel, on
                    // garde l'unité déjà saisie par l'utilisateur (ne pas l'effacer en désélectionnant).
                    benchmarkUnit: entry ? entry.unit : draft.benchmarkUnit,
                  });
                }}
                className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none"
              >
                <option value="">Aucun (repère manuel ou pas encore sourcé)</option>
                {knownStandards.map((standard) => (
                  <option key={standard.key} value={standard.key}>
                    {standard.key}
                    {standard.isMachine ? " · machine" : ""}
                  </option>
                ))}
              </select>
              {selectedStandard && (
                <p className="mt-1.5 text-[0.68rem] text-(--color-fg-faint)">
                  Unité {benchmarkUnitDisplayName[selectedStandard.unit].toLowerCase()} · charge{" "}
                  {CONVENTION_LABEL[selectedStandard.convention]}
                  {selectedStandard.isMachine && " · machine : jauge indicative uniquement"}
                </p>
              )}
            </div>

            {/*
              Unité de repère (BENCHMARK_LEVEL_SPEC.md §1/§4) — verrouillée sur celle du standard
              StrengthLevel choisi ci-dessus (désactivée dans ce cas, déjà affichée juste au-dessus) ;
              éditable seulement en repli manuel (`strengthStandardKey === null`), pour un futur repère
              `benchmarkLow`/`benchmarkHigh` saisi à la main.
            */}
            {draft.strengthStandardKey === null && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                  Unité du repère (si saisi à la main)
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, benchmarkUnit: null })}
                    className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                      draft.benchmarkUnit === null ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                    }`}
                  >
                    Aucune
                  </button>
                  {BENCHMARK_UNITS.map((unit: BenchmarkUnit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setDraft({ ...draft, benchmarkUnit: unit })}
                      className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                        draft.benchmarkUnit === unit ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                      }`}
                    >
                      {benchmarkUnitDisplayName[unit]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reps min/max + incrément */}
            <div className="grid grid-cols-3 gap-2">
              <Stepper
                label="Reps min"
                value={draft.repTargetMin}
                onChange={(v) => setDraft({ ...draft, repTargetMin: v })}
                min={1}
                max={draft.repTargetMax}
              />
              <Stepper
                label="Reps max"
                value={draft.repTargetMax}
                onChange={(v) => setDraft({ ...draft, repTargetMax: v })}
                min={draft.repTargetMin}
                max={50}
              />
              <Stepper
                label="Incrément"
                value={draft.smallestIncrement}
                onChange={(v) => setDraft({ ...draft, smallestIncrement: v })}
                step={0.25}
                min={0.25}
                max={25}
                suffix="kg"
              />
              {/* Bout de pile : au-delà, l'app progresse par les reps au lieu de proposer une
                  charge qui n'existe pas. 0 = pas de limite. */}
              <Stepper
                label="Charge max machine (0 = aucune)"
                value={draft.maxLoad ?? 0}
                onChange={(v) => setDraft({ ...draft, maxLoad: v > 0 ? v : null })}
                step={draft.smallestIncrement > 0 ? draft.smallestIncrement : 2.5}
                min={0}
                max={500}
                suffix="kg"
              />
            </div>

            {equivalents.length > 0 && (
              <div className="glass flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[0.7rem] text-(--color-fg-muted)">Même exercice que</p>
                  <p className="truncate text-sm text-(--color-fg)">{equivalents.map((e) => e.name).join(", ")}</p>
                  <p className="text-[0.66rem] text-(--color-fg-faint)">Courbe et suggestions partagées, records propres à chaque machine.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, equivalenceKey: `solo:${draft.id}` })}
                  className="pill shrink-0 text-[0.7rem] text-(--color-fg-muted) transition active:scale-95"
                >
                  Délier
                </button>
              </div>
            )}

            {/* Mappings musculaires */}
            <MuscleMappingEditor
              mappings={parentMappings}
              onChange={(next) => setDraft({ ...draft, muscleMappings: parentMappingsToLeafMappings(next) })}
            />

            {isEditing && (
              <>
                {/* FatigueClass */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                    Classe de fatigue
                  </label>
                  <div className="mt-1.5">
                    <SegmentedControl
                      layoutId="fatigue-class-editor"
                      value={draft.fatigueClass}
                      onChange={(v) => setDraft({ ...draft, fatigueClass: v as FatigueClass })}
                      options={FATIGUE_CLASSES.map((f) => ({ value: f, label: FATIGUE_LABEL[f] }))}
                    />
                  </div>
                </div>

                {/* ProgressionPolicy */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                    Politique de progression
                  </label>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {PROGRESSION_POLICIES.map((policy: ProgressionPolicy) => (
                      <button
                        key={policy}
                        type="button"
                        onClick={() => setDraft({ ...draft, progressionPolicy: policy === "generic" ? null : policy })}
                        className={`glass flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition ${
                          (draft.progressionPolicy ?? "generic") === policy ? "glass-strong text-(--color-fg)" : "text-(--color-fg-muted)"
                        }`}
                      >
                        {progressionPolicyDisplayName[policy]}
                      </button>
                    ))}
                  </div>
                </div>

                {draft.progressionPolicy === "voluntaryCap" && (
                  <Stepper
                    label="Cap de reps volontaire"
                    value={draft.voluntaryRepCap}
                    onChange={(v) => setDraft({ ...draft, voluntaryRepCap: v })}
                    min={0}
                    max={50}
                  />
                )}

                {/* Repos */}
                <Stepper
                  label="Repos suggéré"
                  value={draft.suggestedRestSeconds}
                  onChange={(v) => setDraft({ ...draft, suggestedRestSeconds: v })}
                  step={15}
                  min={30}
                  max={300}
                  suffix="s"
                />

                {/* Machine / notes */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
                    Réglage machine
                  </label>
                  <input
                    value={draft.machineSetting}
                    onChange={(e) => setDraft({ ...draft, machineSetting: e.target.value })}
                    placeholder="Ex. Niveau 5, banc position 3…"
                    className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Notes</label>
                  <textarea
                    value={draft.setupNotes}
                    onChange={(e) => setDraft({ ...draft, setupNotes: e.target.value })}
                    rows={2}
                    placeholder="Notes de mise en place…"
                    className="glass mt-1.5 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
                  />
                </div>

                {allowDelete && <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className={`rounded-xl border px-3.5 py-2.5 text-center text-sm font-semibold transition ${
                    confirmingDelete
                      ? "border-rose-400/50 bg-rose-400/15 text-rose-300"
                      : "border-white/10 bg-white/5 text-(--color-fg-muted)"
                  }`}
                >
                  {confirmingDelete ? "Confirmer la suppression" : "Supprimer l'exercice"}
                </button>}
                {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
              </>
            )}
          </div>
        </div>

        {!isEditing && error && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !draft.name.trim()}
          className="btn-accent w-full py-3 text-sm disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
  );
}
