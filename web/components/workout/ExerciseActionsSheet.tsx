"use client";

import { useState } from "react";
import { ChevronRight, Copy, Film, Repeat, SlidersHorizontal, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { InlineStepper, SettingRow } from "@/components/ui/SettingRow";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveExercise } from "@/lib/sync/save-exercise";
import { cleanWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Exercise, LoggedExercise } from "@/lib/models/types";
import {
  applyQuickSettings,
  formatRest,
  quickSettingsChanged,
  quickSettingsOf,
  type QuickSettings,
} from "./exercise-quick-settings";

/** Pas proposés pour l'incrément : ceux des piles et des disques réels, pas un pas de 0,25. */
const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 5, 10];
const REST_STEP = 15;
const REST_MIN = 30;
const REST_MAX = 300;

/**
 * Menu d'un exercice en pleine séance (bouton ⋯ ou appui long sur le nom).
 *
 * Ordre = fréquence en salle : d'abord les actions en un tap (remplacer une machine prise,
 * dupliquer, voir la démo), puis les seuls réglages qui changent la prochaine suggestion ou le
 * prochain repos, puis le reste du catalogue derrière « Tous les réglages », et le retrait en
 * dernier. Rien ici ne touche aux séries déjà faites sans filet : remplacer ou retirer un exercice
 * qui en porte passe par le toast « Annuler ».
 */
export function ExerciseActionsSheet({
  open,
  onClose,
  loggedExercise,
  exercise,
  onReplace,
  onDuplicate,
  onShowDemo,
  onOpenAllSettings,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  loggedExercise: LoggedExercise;
  exercise: Exercise;
  onReplace: () => void;
  onDuplicate: () => void;
  /** null : pas de démonstration pour cet exercice. */
  onShowDemo: (() => void) | null;
  onOpenAllSettings: () => void;
  onRemove: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} ariaLabel={`Options : ${exercise.name}`}>
      {/* Monté à l'ouverture seulement : le brouillon repart des réglages à jour à chaque fois. */}
      {open && (
        <ExerciseActionsForm
          loggedExercise={loggedExercise}
          exercise={exercise}
          onClose={onClose}
          onReplace={onReplace}
          onDuplicate={onDuplicate}
          onShowDemo={onShowDemo}
          onOpenAllSettings={onOpenAllSettings}
          onRemove={onRemove}
        />
      )}
    </Sheet>
  );
}

function ExerciseActionsForm({
  loggedExercise,
  exercise,
  onClose,
  onReplace,
  onDuplicate,
  onShowDemo,
  onOpenAllSettings,
  onRemove,
}: {
  loggedExercise: LoggedExercise;
  exercise: Exercise;
  onClose: () => void;
  onReplace: () => void;
  onDuplicate: () => void;
  onShowDemo: (() => void) | null;
  onOpenAllSettings: () => void;
  onRemove: () => void;
}) {
  const [initial] = useState<QuickSettings>(() => quickSettingsOf(exercise));
  const [draft, setDraft] = useState<QuickSettings>(initial);
  const [maxLoadText, setMaxLoadText] = useState(() => (initial.maxLoad ? cleanWeight(initial.maxLoad) : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const doneSets = loggedExercise.sets.filter((set) => set.completed).length;
  const setsLabel = `${doneSets} série${doneSets > 1 ? "s" : ""}`;
  const dirty = quickSettingsChanged(initial, draft);
  const update = (patch: Partial<QuickSettings>) => setDraft((current) => ({ ...current, ...patch }));

  const incrementOptions = INCREMENTS.includes(draft.smallestIncrement)
    ? INCREMENTS
    : [...INCREMENTS, draft.smallestIncrement].sort((a, b) => a - b);
  const incrementIndex = incrementOptions.indexOf(draft.smallestIncrement);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const latest = useWorkoutStore.getState().catalog.find((item) => item.id === exercise.id) ?? exercise;
    try {
      // Hors réseau : catalogue local à jour tout de suite, écriture en file de synchronisation.
      await saveExercise(applyQuickSettings(latest, draft));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réglages non enregistrés, réessaie.");
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="flex flex-col">
      <header className="pb-4">
        <h2 className="font-display text-lg font-bold leading-tight text-(--color-fg)">{exercise.name}</h2>
        <p className="mt-1 text-xs text-(--color-fg-muted)">
          {doneSets > 0 ? `${setsLabel} faite${doneSets > 1 ? "s" : ""} aujourd'hui` : "Pas encore de série aujourd'hui"}
        </p>
      </header>

      <div className={cn("grid gap-2", onShowDemo ? "grid-cols-3" : "grid-cols-2")}>
        <ActionTile icon={Repeat} label="Remplacer" onClick={onReplace} />
        <ActionTile icon={Copy} label="Dupliquer" onClick={onDuplicate} />
        {onShowDemo && <ActionTile icon={Film} label="Démo" onClick={onShowDemo} />}
      </div>
      {doneSets > 0 && (
        <p className="mt-2 text-[0.7rem] text-(--color-fg-faint)">
          Remplacer retire {doneSets > 1 ? `les ${setsLabel} déjà faites` : "la série déjà faite"}, annulable juste après.
        </p>
      )}

      <section className="mt-6" aria-labelledby="quick-settings-title">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="quick-settings-title" className="eyebrow">Réglages</h3>
          <span className="text-[0.68rem] text-(--color-fg-faint)">dès la prochaine série</span>
        </div>

        <label className="mt-3 block">
          <span className="sr-only">Réglage machine</span>
          <input
            value={draft.machineSetting}
            onChange={(event) => update({ machineSetting: event.target.value })}
            placeholder="Réglage machine : siège 4, dossier 2…"
            enterKeyHint="done"
            className="glass w-full rounded-xl px-3.5 py-3 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint) focus:border-(--line-strong)"
          />
        </label>

        <div className="mt-2 divide-y divide-white/[0.06]">
          <SettingRow label="Reps min">
            <InlineStepper
              label="Reps min"
              display={String(draft.repTargetMin)}
              onDecrement={() => update({ repTargetMin: draft.repTargetMin - 1 })}
              onIncrement={() => update({ repTargetMin: draft.repTargetMin + 1 })}
              canDecrement={draft.repTargetMin > 1}
              canIncrement={draft.repTargetMin < draft.repTargetMax}
            />
          </SettingRow>
          <SettingRow label="Reps max">
            <InlineStepper
              label="Reps max"
              display={String(draft.repTargetMax)}
              onDecrement={() => update({ repTargetMax: draft.repTargetMax - 1 })}
              onIncrement={() => update({ repTargetMax: draft.repTargetMax + 1 })}
              canDecrement={draft.repTargetMax > draft.repTargetMin}
              canIncrement={draft.repTargetMax < 50}
            />
          </SettingRow>
          <SettingRow label="Plus petit saut" hint="de charge">
            <InlineStepper
              label="Plus petit saut de charge"
              display={`${cleanWeight(draft.smallestIncrement)} kg`}
              onDecrement={() => update({ smallestIncrement: incrementOptions[incrementIndex - 1] })}
              onIncrement={() => update({ smallestIncrement: incrementOptions[incrementIndex + 1] })}
              canDecrement={incrementIndex > 0}
              canIncrement={incrementIndex < incrementOptions.length - 1}
            />
          </SettingRow>
          <SettingRow label="Charge max" hint="bout de pile">
            <label className="glass flex h-11 w-[9.25rem] items-center rounded-xl pr-3 focus-within:border-(--line-strong)">
              <span className="sr-only">Charge max de la machine, en kilos</span>
              <input
                value={maxLoadText}
                onChange={(event) => {
                  const text = event.target.value.replace(/[^\d.,]/g, "");
                  setMaxLoadText(text);
                  const parsed = Number.parseFloat(text.replace(",", "."));
                  update({ maxLoad: Number.isFinite(parsed) && parsed > 0 ? parsed : null });
                }}
                inputMode="decimal"
                enterKeyHint="done"
                placeholder="Aucune"
                className="tnum min-w-0 flex-1 bg-transparent px-3 text-right text-base text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
              />
              <span className="text-xs text-(--color-fg-muted)">kg</span>
            </label>
          </SettingRow>
          <SettingRow label="Repos">
            <InlineStepper
              label="Repos"
              display={formatRest(draft.suggestedRestSeconds)}
              onDecrement={() => update({ suggestedRestSeconds: draft.suggestedRestSeconds - REST_STEP })}
              onIncrement={() => update({ suggestedRestSeconds: draft.suggestedRestSeconds + REST_STEP })}
              canDecrement={draft.suggestedRestSeconds - REST_STEP >= REST_MIN}
              canIncrement={draft.suggestedRestSeconds + REST_STEP <= REST_MAX}
            />
          </SettingRow>
        </div>

        <button
          type="button"
          onClick={onOpenAllSettings}
          className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left transition active:opacity-70"
        >
          <SlidersHorizontal size={16} className="shrink-0 text-(--color-fg-muted)" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-(--color-fg)">Tous les réglages</span>
            <span className="block truncate text-[0.7rem] text-(--color-fg-faint)">
              Muscles, mode de séries, fatigue, notes…
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-(--color-fg-faint)" aria-hidden />
        </button>
      </section>

      <button
        type="button"
        onClick={() => {
          if (doneSets > 0 && !confirmingRemove) {
            setConfirmingRemove(true);
            return;
          }
          onRemove();
        }}
        className={cn(
          "mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
          confirmingRemove
            ? "border-danger/60 bg-danger/15 text-(--color-danger)"
            : "border-white/10 text-(--color-danger)"
        )}
      >
        <Trash2 size={15} aria-hidden />
        {confirmingRemove ? `Retirer avec ses ${setsLabel}` : "Retirer de la séance"}
      </button>

      {dirty && (
        // Collé au bas de la feuille : visible sans défiler dès qu'un réglage a changé.
        <div className="sticky bottom-0 mt-4 pt-1">
          {error && (
            <p role="alert" className="mb-2 text-xs text-(--color-danger)">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-accent w-full py-3.5 shadow-[0_-10px_28px_rgba(0,0,0,0.55)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer les réglages"}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-xl text-(--color-fg) transition active:scale-[0.97] active:bg-white/[0.06]"
    >
      <Icon size={18} aria-hidden />
      <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em]">{label}</span>
    </button>
  );
}
