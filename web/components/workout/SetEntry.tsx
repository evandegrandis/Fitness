"use client";

import { useState } from "react";
import { AlertTriangle, Check, Flame, History, Snowflake, Sparkles, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Stepper } from "@/components/ui/Stepper";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import type { SetSuggestion } from "@/lib/engines/progression";
import { useWorkoutStore } from "@/lib/store/workout";
import { cn } from "@/lib/utils";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

/**
 * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — signal feu intra-séance : flamme animée + libellé court quand
 * `suggestion.readyForLevelUp` et/ou `.readyForPR` sont vrais (jamais la jauge complète en séance,
 * cf. `BenchmarkGauge` qui n'est jamais importée ici — elle reste sur l'onglet Progrès).
 *
 * `prefers-reduced-motion` : la règle CSS globale (`app/globals.css`, `animation-duration:0.01ms`)
 * neutralise les `animation`/`transition` CSS mais PAS une boucle `animate` framer-motion (WAAPI/JS,
 * hors du système CSS ciblé par cette règle) — d'où `useReducedMotion()` explicite ici, qui coupe la
 * boucle et retombe sur un rendu statique (aucun `animate`, `transition` à durée nulle).
 */
function FlameBadge({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
      style={{ color: "#fb923c", background: "rgba(251,146,60,0.14)" }}
    >
      <motion.span
        className="grid shrink-0 place-items-center"
        animate={reduceMotion ? undefined : { scale: [1, 1.22, 1], rotate: [0, -6, 6, 0] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame size={14} fill="#fb923c" strokeWidth={1.5} />
      </motion.span>
      <span>{label}</span>
    </div>
  );
}

/**
 * ReasonCodes signalant une escalade / un changement de méthode — affichés via `suggestion.explanation`.
 * VARIATION_CYCLING_SPEC §8 — `"variant_switch"` corrigé en `"variant_switch_easier"` (mismatch réel :
 * `progression.ts` émet `"variant_switch_easier"`, jamais `"variant_switch"` — cette liste ne
 * matchait donc jamais la bascule de variante facile BW, §7.4). `"variation"` (rotation sur plateau
 * daté, §2/§4/§6) était déjà correct ici — 0 hit avant P1.6 faute de valeur produite côté moteur.
 * `"variation_preemptive"` (rotation PRÉEMPTIVE sur `slowing`, §3/§4.2, P2.3) est volontairement
 * ABSENT de cette liste : elle doit rester discrète (pas l'encart accentué/icône éclair réservé aux
 * vraies escalades) — voir le rendu `variantCandidateName` dans le paragraphe muet ci-dessous.
 */
const INTENSITY_REASON_CODES = [
  "overreach",
  "add_set",
  "rest_pause",
  "variation",
  "reactive_deload",
  "variant_switch_easier",
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
  variantCandidateName = null,
}: {
  loggedExerciseId: string;
  exercise: Exercise;
  suggestion: SetSuggestion;
  warmup: SetSuggestion | null;
  lastSessionSet: LoggedSet | null;
  onLogSet: (input: { weight: number; reps: number; setType?: SetType }) => void;
  /**
   * VARIATION_CYCLING_SPEC §8 — nom résolu (catalogue) de `suggestion.switchToVariantId`, calculé
   * par l'appelant (`ExerciseCard.tsx`, qui a accès au catalogue) : `SetEntry` reste découplé du
   * store. `null`/absent => pas de bascule proposée, comportement inchangé.
   */
  variantCandidateName?: string | null;
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

  /**
   * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — le feu ne promet que ce que `suggest()` a réellement
   * calculé pour LE POIDS/REPS SUGGÉRÉS : masqué en échauffement (poids volontairement réduit) et
   * si l'utilisateur a modifié les steppers loin de la suggestion (sinon la promesse ne tiendrait
   * plus pour ce qui va être réellement loggé — même logique que le chip "revenir à la suggestion"
   * ci-dessous, mutuellement exclusif avec lui par construction).
   */
  const matchesSuggestion = !useWarmup && weight === suggestion.weight && reps === suggestion.reps;
  const flameLabels: string[] = [];
  if (matchesSuggestion && suggestion.readyForPR) flameLabels.push("PR en vue");
  if (matchesSuggestion && suggestion.readyForLevelUp && suggestion.nextLevelName) {
    flameLabels.push(`passage ${suggestion.nextLevelName}`);
  }

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

      {flameLabels.length > 0 && <FlameBadge label={flameLabels.join(" · ")} />}

      {!useWarmup && intensityReasonCode && (
        <p
          className="flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium"
          style={{ color: "var(--accent)", background: "rgba(255,138,61,0.10)" }}
        >
          <Zap size={12} className="mt-0.5 shrink-0" />
          {/* VARIATION_CYCLING_SPEC §8 — nomme la variante candidate quand `switchToVariantId` est
              posé (résolu par l'appelant). Purement informatif ici : la bascule elle-même ne
              s'accepte que dans le bilan (§8, non destructif, jamais en pleine séance). */}
          <span>
            {suggestion.explanation}
            {variantCandidateName && <> → envisager <strong>{variantCandidateName}</strong> à la prochaine séance</>}
          </span>
        </p>
      )}

      {!useWarmup && !intensityReasonCode && (
        <p className="text-xs text-[--color-fg-muted]">
          {suggestion.explanation}
          {/* VARIATION_CYCLING_SPEC §3/§4.2/§8 (P2.3) — rotation PRÉEMPTIVE ("slowing",
              `reasonCodes` contient "variation_preemptive", volontairement PAS dans
              `INTENSITY_REASON_CODES`) : même phrase que le cas plateau, mais SANS l'encart
              accentué/icône éclair réservé aux vraies escalades — reste discret, non intrusif,
              cohérent avec "progressing: zéro bruit" et le simple indice visuel de `slowing`
              (chip `ExerciseCard.tsx`). */}
          {variantCandidateName && <> → envisager <strong>{variantCandidateName}</strong> à la prochaine séance</>}
        </p>
      )}

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
