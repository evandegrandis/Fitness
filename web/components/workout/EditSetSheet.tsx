"use client";

import { useState } from "react";
import { Flame, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  REPORTED_RIR_OPTIONS,
  reportedRirLabel,
  SetType,
  STOP_REASONS,
  stopReasonDisplayName,
  type StopReason,
} from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import { cn } from "@/lib/utils";

type Target = { loggedExerciseId: string; set: LoggedSet };

/** Feuille d'édition d'un set déjà loggué : ajuster poids/reps ou supprimer. */
export function EditSetSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const active = useWorkoutStore((s) => s.active);

  const loggedExercise = active?.exercises.find((e) => e.id === target?.loggedExerciseId);
  const exercise = loggedExercise ? catalog.find((e) => e.id === loggedExercise.exerciseId) : undefined;

  return (
    <Sheet open={target !== null} onClose={onClose}>
      {/* key = set.id force un remount (donc un état frais) à chaque set différent */}
      {target && <EditSetForm key={target.set.id} target={target} exercise={exercise} onClose={onClose} />}
    </Sheet>
  );
}

function EditSetForm({
  target,
  exercise,
  onClose,
}: {
  target: Target;
  exercise: Exercise | undefined;
  onClose: () => void;
}) {
  const editSet = useWorkoutStore((s) => s.editSet);
  const deleteSet = useWorkoutStore((s) => s.deleteSet);

  const [weight, setWeight] = useState(target.set.weight);
  const [reps, setReps] = useState(target.set.reps);
  const [isFinisher, setIsFinisher] = useState(target.set.setType === SetType.finisher);
  const [rir, setRir] = useState<number | null>(target.set.reportedRir ?? null);
  const [stopReason, setStopReason] = useState<StopReason | null>(target.set.stopReason ?? null);

  const increment = exercise && exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 2.5;
  const isWarmup = target.set.setType === SetType.warmup;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base font-bold text-[--color-fg]">Modifier le set</h2>
      <div className="flex items-center justify-center gap-6">
        <Stepper label="Poids" value={weight} onChange={setWeight} step={increment} min={0} suffix="kg" />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={1} />
      </div>

      {/* RIR + raison d'arrêt — non pertinents pour un échauffement. */}
      {!isWarmup && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[--color-fg-muted]">Reps en réserve (RIR)</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {REPORTED_RIR_OPTIONS.map((option) => {
                const selected = rir === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRir((current) => (current === option ? null : option))}
                    aria-pressed={selected}
                    aria-label={`Reps en réserve ${reportedRirLabel(option)}${option === 0 ? " (échec)" : ""}`}
                    className={cn("pill min-h-11 min-w-11 justify-center", selected && "ring-1 ring-[color:var(--accent)]/70")}
                    style={
                      selected
                        ? { color: "var(--accent)", background: "rgba(255,138,61,0.14)" }
                        : { color: "var(--color-fg-muted)" }
                    }
                  >
                    {reportedRirLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[--color-fg-muted]">Arrêt de la série</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {STOP_REASONS.map((reason) => {
                const selected = stopReason === reason;
                // Douleur/matériel : la série n'entraîne pas le modèle (ton rose d'alerte).
                const isExcluding = reason === "pain" || reason === "equipment";
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setStopReason((current) => (current === reason ? null : reason))}
                    aria-pressed={selected}
                    className={cn("pill min-h-11 justify-center", selected && "ring-1")}
                    style={
                      selected
                        ? isExcluding
                          ? { color: "#fb7185", background: "rgba(251,113,133,0.14)" }
                          : { color: "var(--accent)", background: "rgba(255,138,61,0.14)" }
                        : { color: "var(--color-fg-muted)" }
                    }
                  >
                    {stopReasonDisplayName[reason]}
                  </button>
                );
              })}
            </div>
            {(stopReason === "pain" || stopReason === "equipment") && (
              <span className="text-[0.7rem] text-rose-200/80">
                Série non représentative : exclue des baselines de performance et des records.
              </span>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setIsFinisher((value) => !value)}
        aria-pressed={isFinisher}
        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
          isFinisher
            ? "border-rose-300/40 bg-rose-300/12 text-rose-200"
            : "border-white/10 text-[--color-fg-muted]"
        }`}
      >
        <Flame size={15} />
        Finisher, hors prévision normale
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            deleteSet(target.loggedExerciseId, target.set.id);
            onClose();
          }}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-rose-400 active:scale-[0.97] transition"
        >
          <Trash2 size={16} />
          Supprimer
        </button>
        <button
          type="button"
          onClick={() => {
            editSet(target.set.id, {
              weight,
              reps,
              setType: isFinisher
                ? SetType.finisher
                : target.set.setType === SetType.finisher
                  ? SetType.work
                  : target.set.setType,
              reportedRir: isWarmup ? null : rir,
              stopReason: isWarmup ? null : stopReason,
            });
            onClose();
          }}
          className="btn-accent flex-[2] py-3 text-sm active:scale-[0.97] transition"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
