"use client";

import { Trash2 } from "lucide-react";
import { Stepper } from "@/components/ui/Stepper";
import { MUSCLE_PARENTS, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import type { MuscleMapping } from "@/lib/models/types";

/**
 * Éditeur de mappings musculaires — un mapping par `MuscleParent` (au lieu
 * des feuilles `MuscleGroup`, plus fines mais peu pertinentes à éditer
 * manuellement côté web). Chaque mapping : Picker de parent + Stepper de
 * coefficient (0.1–1.0, pas 0.1) + suppression. "Ajouter un muscle" choisit
 * automatiquement le premier parent non encore mappé.
 *
 * Représentation interne : `MuscleMapping.muscleGroup` est en réalité
 * détourné pour stocker le rawValue du `MuscleParent` choisi (le modèle
 * `Exercise.muscleMappings` attend des `MuscleGroup` feuilles côté iOS ; ici,
 * pour rester simple côté web sans dupliquer 30 feuilles dans l'UI, on mappe
 * 1 parent -> 1 feuille "représentative" au moment de la sauvegarde). Voir
 * `parentToRepresentativeLeaf` dans ExerciseEditorSheet.
 */
export function MuscleMappingEditor({
  mappings,
  onChange,
}: {
  /** Mappings déjà résolus au niveau parent : [MuscleParent, coefficient]. */
  mappings: [MuscleParent, number][];
  onChange: (next: [MuscleParent, number][]) => void;
}) {
  const usedParents = new Set(mappings.map(([p]) => p));
  const available = MUSCLE_PARENTS.filter((p) => !usedParents.has(p));

  function updateCoefficient(parent: MuscleParent, coefficient: number) {
    onChange(mappings.map(([p, c]) => (p === parent ? [p, coefficient] : [p, c])));
  }

  function updateParent(oldParent: MuscleParent, newParent: MuscleParent) {
    if (usedParents.has(newParent) && newParent !== oldParent) return;
    onChange(mappings.map(([p, c]) => (p === oldParent ? [newParent, c] : [p, c])));
  }

  function remove(parent: MuscleParent) {
    onChange(mappings.filter(([p]) => p !== parent));
  }

  function add() {
    const next = available[0];
    if (!next) return;
    onChange([...mappings, [next, 0.5]]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Muscles travaillés</p>
      {mappings.length === 0 && (
        <p className="text-sm text-(--color-fg-faint)">Aucun muscle mappé pour l&apos;instant.</p>
      )}
      <div className="flex flex-col gap-2">
        {mappings.map(([parent, coefficient]) => (
          <div key={parent} className="glass flex items-center gap-2 rounded-xl px-3 py-2.5">
            <select
              value={parent}
              onChange={(e) => updateParent(parent, e.target.value as MuscleParent)}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-(--color-fg) outline-none"
            >
              <option className="bg-(--color-ink-800)" value={parent}>
                {parentDisplayName[parent]}
              </option>
              {available.map((p) => (
                <option key={p} className="bg-(--color-ink-800)" value={p}>
                  {parentDisplayName[p]}
                </option>
              ))}
            </select>
            <Stepper
              value={Math.round(coefficient * 10) / 10}
              onChange={(v) => updateCoefficient(parent, v)}
              step={0.1}
              min={0.1}
              max={1.0}
              className="scale-75"
            />
            <button
              type="button"
              onClick={() => remove(parent)}
              aria-label={`Retirer ${parentDisplayName[parent]}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-(--color-fg-faint) active:scale-90 transition"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="pill self-start bg-white/8 active:scale-95 transition"
        >
          + Ajouter un muscle
        </button>
      )}
    </div>
  );
}

/** Convertit `MuscleMapping[]` (feuilles) en liste de niveau parent (max coefficient par parent), pour l'édition. */
export function mappingsToParentLevel(mappings: MuscleMapping[], leafToParent: Record<string, MuscleParent>): [MuscleParent, number][] {
  const byParent = new Map<MuscleParent, number>();
  for (const m of mappings) {
    const parent = leafToParent[m.muscleGroup];
    if (!parent) continue;
    byParent.set(parent, Math.max(byParent.get(parent) ?? 0, m.coefficient));
  }
  return [...byParent.entries()];
}
