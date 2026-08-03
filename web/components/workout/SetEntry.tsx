"use client";

import { useState } from "react";
import { AlertTriangle, Check, History, Snowflake, Sparkles, Zap } from "lucide-react";
import { Stepper } from "@/components/ui/Stepper";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import type { SetSuggestion } from "@/lib/engines/progression";
import { useWorkoutStore } from "@/lib/store/workout";
import { cn } from "@/lib/utils";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

/** ReasonCodes signalant une escalade / un changement de méthode — affichés via `suggestion.explanation`. */
const INTENSITY_REASON_CODES = [
  "overreach",
  "add_set",
  "rest_pause",
  "variation",
  "reactive_deload",
  "variant_switch",
  "drop_set_completion",
];

/**
 * Zone de saisie d'un set : steppers poids/reps pré-remplis par la
 * suggestion, chips contextuelles, bouton Valider.
 *
 * `key` côté appelant (voir ExerciseCard, basé sur le nombre de sets loggués)
 * force un remount quand la suggestion sous-jacente change, ce qui évite un
 * effect de resynchronisation ici — l'état interne part toujours frais des
 * dernières props de suggestion.
 */
export function SetEntry({
  loggedExerciseId,
  exercise,
  suggestion,
  warmup,
  lastSessionSet,
  onLogSet,
}: {
  loggedExerciseId: string;
  exercise: Exercise;
  suggestion: SetSuggestion;
  warmup: SetSuggestion | null;
  lastSessionSet: LoggedSet | null;
  onLogSet: (input: { weight: number; reps: number; setType?: SetType }) => void;
}) {
  const freshOverrides = useWorkoutStore((s) => s.freshOverrides);
  const setFreshOverride = useWorkoutStore((s) => s.setFreshOverride);
  const clearFreshOverride = useWorkoutStore((s) => s.clearFreshOverride);
  const isFresh = freshOverrides.has(loggedExerciseId);

  const [useWarmup, setUseWarmup] = useState(false);
  const active = useWarmup && warmup ? warmup : suggestion;

  const [weight, setWeight] = useState(active.weight);
  const [reps, setReps] = useState(active.reps);

  const showFreshChip = isFresh || suggestion.reasonCodes.includes("deload_after_gap");
  const intensityReasonCode = suggestion.reasonCodes.find((code) => INTENSITY_REASON_CODES.includes(code));

  const toggleWarmup = () => {
    const next = !useWarmup;
    setUseWarmup(next);
    const source = next && warmup ? warmup : suggestion;
    setWeight(source.weight);
    setReps(source.reps);
  };

  const increment = exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 2.5;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {lastSessionSet && (
          <button
            type="button"
            onClick={() => {
              setUseWarmup(false);
              setWeight(lastSessionSet.weight);
              setReps(lastSessionSet.reps);
            }}
            className="pill"
          >
            <History size={11} />↻ dernier · {lastSessionSet.weight > 0 ? `${cleanWeight(lastSessionSet.weight)}kg` : "BW"}×{lastSessionSet.reps}
          </button>
        )}
        {warmup && (
          <button
            type="button"
            onClick={toggleWarmup}
            className={cn("pill", useWarmup && "ring-1 ring-amber-300/60")}
            style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}
          >
            W échauffement
          </button>
        )}
        {/* Chip "revenir à la suggestion" : utile UNIQUEMENT après un ajustement
            manuel (sinon les steppers montrent déjà la suggestion → redondant). */}
        {!useWarmup && (weight !== suggestion.weight || reps !== suggestion.reps) && (
          <button
            type="button"
            onClick={() => {
              setWeight(suggestion.weight);
              setReps(suggestion.reps);
            }}
            className="pill"
            style={{ color: "var(--accent)" }}
          >
            <Sparkles size={11} />
            Suggestion {cleanWeight(suggestion.weight)}{suggestion.weight > 0 ? "kg" : ""}×{suggestion.reps}
          </button>
        )}
        {suggestion.sessionFatigueWarning && !useWarmup && (
          <span className="pill" style={{ color: "#fb7185", background: "rgba(251,113,133,0.12)" }}>
            <AlertTriangle size={11} />
            {suggestion.sessionFatigueWarning}
          </span>
        )}
        {showFreshChip && !useWarmup && (
          <button
            type="button"
            onClick={() => (isFresh ? clearFreshOverride(loggedExerciseId) : setFreshOverride(loggedExerciseId))}
            aria-pressed={isFresh}
            className={cn("pill", isFresh && "ring-1 ring-[color:#34d399]/60")}
            style={
              isFresh
                ? { color: "#34d399", background: "rgba(52,211,153,0.14)" }
                : { color: "var(--color-fg-muted)" }
            }
          >
            <Snowflake size={11} />
            Je suis frais
          </button>
        )}
      </div>

      {!useWarmup && intensityReasonCode && (
        <p
          className="flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium"
          style={{ color: "var(--accent)", background: "rgba(255,138,61,0.10)" }}
        >
          <Zap size={12} className="mt-0.5 shrink-0" />
          <span>{suggestion.explanation}</span>
        </p>
      )}

      {!useWarmup && !intensityReasonCode && <p className="text-xs text-[--color-fg-muted]">{suggestion.explanation}</p>}

      <div className="flex items-center justify-center gap-6">
        <Stepper label="Poids" value={weight} onChange={setWeight} step={increment} min={0} suffix="kg" />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />
      </div>

      <button
        type="button"
        onClick={() => {
          onLogSet({ weight, reps, setType: useWarmup ? SetType.warmup : suggestion.setType });
          setUseWarmup(false);
        }}
        className="btn-accent flex w-full items-center justify-center gap-2 py-3.5 text-base active:scale-[0.97] transition"
      >
        <Check size={18} />
        Valider
      </button>
    </div>
  );
}
