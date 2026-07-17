"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { upsertExercise, deleteExercise } from "@/lib/db/actions";
import {
  FATIGUE_CLASSES,
  PROGRESSION_POLICIES,
  progressionPolicyDisplayName,
  SET_PATTERN_MODES,
  setPatternModeDisplayName,
  type FatigueClass,
  type ProgressionPolicy,
  type SetPatternMode,
} from "@/lib/models/enums";
import { LEAF_TO_PARENT, LEAVES_OF_PARENT, type MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleMapping } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { MuscleMappingEditor, mappingsToParentLevel } from "@/components/exercise/MuscleMappingEditor";
import { ExerciseGif } from "@/components/exercise/ExerciseGif";

const FATIGUE_LABEL: Record<FatigueClass, string> = { heavy: "Lourd", medium: "Moyen", light: "Léger" };

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
}: {
  open: boolean;
  onClose: () => void;
  /** null = création. */
  exercise: Exercise | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} full>
      {open && <ExerciseEditorForm key={exercise?.id ?? "new"} onClose={onClose} exercise={exercise} />}
    </Sheet>
  );
}

function ExerciseEditorForm({
  onClose,
  exercise,
}: {
  onClose: () => void;
  exercise: Exercise | null;
}) {
  const catalogLength = useWorkoutStore((s) => s.catalog.length);
  const [draft, setDraft] = useState<Exercise>(() => exercise ?? emptyExercise());
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isEditing = exercise !== null;

  const parentMappings = mappingsToParentLevel(draft.muscleMappings, LEAF_TO_PARENT);

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    const toSave: Exercise = {
      ...draft,
      name: draft.name.trim(),
      category: draft.category.trim() || "Autre",
      sortOrder: isEditing ? draft.sortOrder : catalogLength,
    };
    await upsertExercise(toSave);
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (!exercise) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setSaving(true);
    await deleteExercise(exercise.id);
    setSaving(false);
    onClose();
  }

  return (
      <div className="flex h-full flex-col">
        <h2 className="font-display text-lg font-bold text-[--color-fg]">
          {isEditing ? "Modifier l'exercice" : "Nouvel exercice"}
        </h2>

        <div className="mt-4 flex-1 overflow-y-auto pb-6">
          <div className="flex flex-col gap-5">
            {/* Nom + favori */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Nom</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex. Développé couché"
                  className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
                />
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, isFavorite: !draft.isFavorite })}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
                      draft.isFavorite ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/10 bg-white/5 text-[--color-fg-faint]"
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
              <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Catégorie</label>
              <input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="Ex. push, pull, legs…"
                className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
              />
            </div>

            {/* SetPatternMode */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Mode de sets</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {SET_PATTERN_MODES.map((mode: SetPatternMode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraft({ ...draft, setPatternMode: mode })}
                    className={`glass rounded-xl px-3 py-2 text-xs font-medium transition ${
                      draft.setPatternMode === mode ? "glass-strong text-[--color-fg]" : "text-[--color-fg-muted]"
                    }`}
                  >
                    {setPatternModeDisplayName[mode]}
                  </button>
                ))}
              </div>
            </div>

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
                step={0.5}
                min={0.5}
                max={25}
                suffix="kg"
              />
            </div>

            {/* Mappings musculaires */}
            <MuscleMappingEditor
              mappings={parentMappings}
              onChange={(next) => setDraft({ ...draft, muscleMappings: parentMappingsToLeafMappings(next) })}
            />

            {isEditing && (
              <>
                {/* FatigueClass */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
                    Politique de progression
                  </label>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {PROGRESSION_POLICIES.map((policy: ProgressionPolicy) => (
                      <button
                        key={policy}
                        type="button"
                        onClick={() => setDraft({ ...draft, progressionPolicy: policy === "generic" ? null : policy })}
                        className={`glass flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition ${
                          (draft.progressionPolicy ?? "generic") === policy ? "glass-strong text-[--color-fg]" : "text-[--color-fg-muted]"
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
                    Réglage machine
                  </label>
                  <input
                    value={draft.machineSetting}
                    onChange={(e) => setDraft({ ...draft, machineSetting: e.target.value })}
                    placeholder="Ex. Niveau 5, banc position 3…"
                    className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Notes</label>
                  <textarea
                    value={draft.setupNotes}
                    onChange={(e) => setDraft({ ...draft, setupNotes: e.target.value })}
                    rows={2}
                    placeholder="Notes de mise en place…"
                    className="glass mt-1.5 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className={`rounded-xl border px-3.5 py-2.5 text-center text-sm font-semibold transition ${
                    confirmingDelete
                      ? "border-rose-400/50 bg-rose-400/15 text-rose-300"
                      : "border-white/10 bg-white/5 text-[--color-fg-muted]"
                  }`}
                >
                  {confirmingDelete ? "Confirmer la suppression" : "Supprimer l'exercice"}
                </button>
              </>
            )}
          </div>
        </div>

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
