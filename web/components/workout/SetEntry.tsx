"use client";

import { useId, useState } from "react";
import { AlertTriangle, Check, Flame, History, Snowflake, Sparkles, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Stepper } from "@/components/ui/Stepper";
import { REPORTED_RIR_OPTIONS, reportedRirLabel, SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import {
  reprojectSuggestionAtWeight,
  SUGGESTION_ENGINE_VERSION,
  type SetSuggestion,
} from "@/lib/engines/progression";
import { useWorkoutStore } from "@/lib/store/workout";
import { cn } from "@/lib/utils";
import { cleanWeight, formatDecimal } from "@/lib/format";

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
  "logical_set_completion",
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
  onLogSet: (input: {
    weight: number;
    reps: number;
    setType?: SetType;
    suggestedWeight?: number | null;
    suggestedReps?: number | null;
    suggestedSetType?: SetType | null;
    predictedRepsAtActualWeight?: number | null;
    suggestionMode?: string | null;
    suggestionReasonCodes?: string[];
    suggestionEngineVersion?: string | null;
    reportedRir?: number | null;
  }) => void;
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
  const bodyweightKg = useWorkoutStore((s) => s.settings.bodyWeightKg ?? undefined);
  const isFresh = freshOverrides.has(loggedExerciseId);

  const [useWarmup, setUseWarmup] = useState(false);
  const active = useWarmup && warmup ? warmup : suggestion;

  const [weight, setWeight] = useState(active.weight);
  const [reps, setReps] = useState(active.reps);
  const [showFatigueDetails, setShowFatigueDetails] = useState(false);
  // RIR rapporté (oui.rtf #1) : facultatif, jamais présélectionné, non bloquant. L'état repart
  // frais à chaque set (remount via `key` côté ExerciseCard). Non capté en échauffement.
  const [rir, setRir] = useState<number | null>(null);
  const fatigueDetailsId = useId();

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
  const projectedSuggestion = reprojectSuggestionAtWeight(suggestion, exercise, weight, bodyweightKg);

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
            <History size={11} />dernier · {lastSessionSet.weight > 0 ? `${cleanWeight(lastSessionSet.weight)}kg` : "PDC"}×{lastSessionSet.reps}
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
          <button
            type="button"
            onClick={() => setShowFatigueDetails((value) => !value)}
            aria-expanded={showFatigueDetails}
            aria-controls={suggestion.sessionFatigueEvidence ? fatigueDetailsId : undefined}
            className="pill min-h-11"
            style={{ color: "#fb7185", background: "rgba(251,113,133,0.12)" }}
          >
            <AlertTriangle size={11} />
            {suggestion.sessionFatigueWarning}
          </button>
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

      {showFatigueDetails && suggestion.sessionFatigueEvidence && !useWarmup && (
        <div
          id={fatigueDetailsId}
          role="region"
          aria-label="Justification de la fatigue détectée"
          className="rounded-xl border border-rose-300/20 bg-rose-300/[0.055] px-3 py-2 text-xs text-rose-100"
        >
          {suggestion.sessionFatigueEvidence.kind === "local" ? (
            <p>
              {suggestion.sessionFatigueEvidence.sameParentSets} séries effectives du même groupe avant cet exercice
              {suggestion.sessionFatigueEvidence.baselineSameParentSets === null
                ? " ; pas encore assez d’historique pour établir l’habitude."
                : `, contre ${suggestion.sessionFatigueEvidence.baselineSameParentSets} habituellement (+${suggestion.sessionFatigueEvidence.excessSameParentSets}).`}
            </p>
          ) : (
            <p>
              Coût de séance {formatDecimal(suggestion.sessionFatigueEvidence.totalSystemicCost)}
              {suggestion.sessionFatigueEvidence.baselineSystemicCost === null
                ? " ; pas encore assez d’historique pour établir l’habitude."
                : `, contre ${formatDecimal(suggestion.sessionFatigueEvidence.baselineSystemicCost)} habituellement.`}
            </p>
          )}
          {suggestion.sessionFatigueEvidence.contributors.length > 0 && (
            <p className="mt-1 text-rose-100/70">
              {suggestion.sessionFatigueEvidence.contributors
                .map((item) => `${item.exerciseName} : ${item.effectiveSets} série${item.effectiveSets > 1 ? "s" : ""}`)
                .join(" · ")}
            </p>
          )}
          <p className="mt-1 text-rose-100/70">
            Ajustement estimé : {suggestion.sessionFatigueEvidence.repPenalty} rep
            {suggestion.sessionFatigueEvidence.repPenalty > 1 ? "s" : ""} au maximum.
          </p>
        </div>
      )}

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
        <p className="text-xs text-(--color-fg-muted)">
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

      {/* Deux tuiles pleine largeur : plus basses que les réglages empilés, et plus serrées au
          milieu de la carte. Elles tiennent aussi dans une carte de superset, plus étroite. */}
      <div className="grid grid-cols-2 gap-2">
        <Stepper
          variant="tile"
          label="Poids"
          value={weight}
          onChange={(nextWeight) => {
            setWeight(nextWeight);
            if (!useWarmup) {
              setReps(reprojectSuggestionAtWeight(suggestion, exercise, nextWeight, bodyweightKg).reps);
            }
          }}
          step={increment}
          min={0}
          suffix="kg"
        />
        <Stepper variant="tile" label="Reps" value={reps} onChange={setReps} step={1} min={1} />
      </div>

      {/* RIR (reps en réserve) — oui.rtf #1 : facultatif, 1 tap, aucune présélection, jamais en
          échauffement. Tap sur la valeur déjà choisie = désélection. Valider sans choisir loggue
          `reportedRir=null` (zéro friction). Éditable ensuite via la ligne du set. */}
      {!useWarmup && (
        <div className="flex items-center gap-1.5">
          <span className="w-7 shrink-0 text-xs text-(--color-fg-muted)">RIR</span>
          {REPORTED_RIR_OPTIONS.map((option) => {
            const selected = rir === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRir((current) => (current === option ? null : option))}
                aria-pressed={selected}
                aria-label={`Reps en réserve ${reportedRirLabel(option)}${option === 0 ? " (échec)" : ""}`}
                className={cn("pill min-h-11 min-w-0 flex-1 justify-center", selected && "ring-1 ring-[color:var(--accent)]/70")}
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
      )}

      <button
        type="button"
        onClick={() => {
          onLogSet({
            weight,
            reps,
            setType: useWarmup ? SetType.warmup : SetType.work,
            suggestedWeight: useWarmup ? warmup?.weight ?? null : suggestion.weight,
            suggestedReps: useWarmup ? warmup?.reps ?? null : suggestion.reps,
            suggestedSetType: useWarmup ? SetType.warmup : suggestion.setType,
            predictedRepsAtActualWeight: useWarmup ? null : projectedSuggestion.reps,
            suggestionMode: useWarmup ? warmup?.mode ?? null : suggestion.mode,
            suggestionReasonCodes: useWarmup ? warmup?.reasonCodes ?? [] : suggestion.reasonCodes,
            suggestionEngineVersion: SUGGESTION_ENGINE_VERSION,
            reportedRir: useWarmup ? null : rir,
          });
          setUseWarmup(false);
          setRir(null);
        }}
        className="btn-accent flex w-full items-center justify-center gap-2 py-3.5 text-base active:scale-[0.97] transition"
      >
        <Check size={18} />
        Valider
      </button>
    </div>
  );
}
