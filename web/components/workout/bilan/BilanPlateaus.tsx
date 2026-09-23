"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRightLeft, Check, PartyPopper, RotateCcw, Target, X } from "lucide-react";
import type { SessionReview } from "@/lib/engines/bilan";
import { saveSession } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { PLATEAU_WEAK_POINTS, plateauWeakPointLabel, type PlateauWeakPoint } from "@/lib/models/enums";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — capture 1-tap CONTEXTUELLE « où ça a calé ? »,
 * affichée UNIQUEMENT tant que `plateau.needsWeakPointCapture` (entrée en plateau toujours
 * active + pas encore répondu) : disparaît d'elle-même dès qu'une réponse est donnée (le store
 * remet `needsWeakPointCapture=false` au prochain recalcul, §8 "apparaît au bon moment, disparaît
 * quand inutile"). SEULE donnée utilisateur réellement nouvelle persistée par cette feature :
 * mutée dans le store puis écrite en base via `saveSession` (même découplage store/DB que
 * `ActiveSession.tsx`/`PostWorkoutSheet.tsx` — le store reste une simple mutation pure,
 * l'écriture DB est la responsabilité du composant).
 */
function BilanWeakPointCapture({ review, sessionId }: { review: SessionReview; sessionId: string }) {
  const setPlateauWeakPoint = useWorkoutStore((s) => s.setPlateauWeakPoint);
  const catalog = useWorkoutStore((s) => s.catalog);

  const captures = review.exercises.filter((exerciseReview) => exerciseReview.plateau.needsWeakPointCapture);

  if (captures.length === 0) return null;

  const handleTap = (loggedExerciseId: string, weakPoint: PlateauWeakPoint) => {
    setPlateauWeakPoint(sessionId, loggedExerciseId, weakPoint);
    const updated = useWorkoutStore.getState().history.find((s) => s.id === sessionId);
    if (updated) {
      void writeThrough(
        { kind: "session", session: updated },
        () => saveSession(updated, false)
      ).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {captures.map((exerciseReview) => (
        <div key={exerciseReview.loggedExerciseId} className="glass glass-card" style={{ borderColor: "rgba(96,165,250,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#60a5fa" }}>
            <Target size={13} />
            Où ça a calé ?
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{exerciseReview.exerciseName}</p>
          <div className="mt-3 flex gap-2">
            {PLATEAU_WEAK_POINTS.map((point) => (
              <button
                key={point}
                type="button"
                onClick={() => handleTap(exerciseReview.loggedExerciseId, point)}
                className="glass flex-1 rounded-xl px-3 py-2 text-sm font-medium text-[--color-fg] transition active:scale-[0.97]"
              >
                {plateauWeakPointLabel(
                  point,
                  catalog.find((exercise) => exercise.id === exerciseReview.exerciseId)?.movementPattern ?? null
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * VARIATION_CYCLING_SPEC §8 — carte « accepter / refuser » pour chaque exercice dont
 * `plateau.suggestedVariant` est non-null (plateau v2 toujours actif après la séance + un pair
 * valide trouvé par `selectAlternative`). Non destructif : accepter précharge la variante pour la
 * PROCHAINE séance (`acceptVariantSwitch`, jamais en pleine séance) ; la carte disparaît ensuite
 * (`treatedVariantSuggestions`, scope = cette séance, voir doc du store).
 */
function BilanVariantSuggestions({ review, sessionId }: { review: SessionReview; sessionId: string }) {
  const acceptVariantSwitch = useWorkoutStore((s) => s.acceptVariantSwitch);
  const dismissVariantSwitch = useWorkoutStore((s) => s.dismissVariantSwitch);

  const suggestions = review.exercises
    .filter((exerciseReview) => exerciseReview.plateau.suggestedVariant !== null)
    .map((exerciseReview) => ({
      exerciseId: exerciseReview.exerciseId,
      variant: exerciseReview.plateau.suggestedVariant!,
    }));

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {suggestions.map(({ exerciseId, variant }) => (
        <div key={exerciseId} className="glass glass-card" style={{ borderColor: "rgba(255,138,61,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#ff8a3d" }}>
            <ArrowRightLeft size={13} />
            Rotation de variation
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{variant.explanationFR}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => acceptVariantSwitch(sessionId, exerciseId, variant.exerciseId)}
              className="btn-accent flex flex-1 items-center justify-center gap-1.5 py-2 text-sm active:scale-[0.97] transition"
            >
              <Check size={15} />
              Passer à {variant.exerciseName}
            </button>
            <button
              type="button"
              onClick={() => dismissVariantSwitch(sessionId, exerciseId)}
              className="flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-[--color-fg-muted] transition active:scale-[0.97]"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <X size={15} />
              Non merci
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Plateaux cassés / en cours, et anti-plateau échoué (méthode à changer). */
export function BilanPlateaus({ review, sessionId }: { review: SessionReview; sessionId: string }) {
  const { plateausBroken, enteringPlateau, antiPlateauFailed, tooAmbitious, notAmbitiousEnough } = review;

  const hasPlateauInfo = plateausBroken.length > 0 || enteringPlateau.length > 0 || antiPlateauFailed.length > 0;
  const hasAmbitionInfo = tooAmbitious.length > 0 || notAmbitiousEnough.length > 0;
  const hasVariantSuggestions = review.exercises.some((e) => e.plateau.suggestedVariant !== null);
  const hasWeakPointCapture = review.exercises.some((e) => e.plateau.needsWeakPointCapture);

  if (!hasPlateauInfo && !hasAmbitionInfo && !hasVariantSuggestions && !hasWeakPointCapture) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="flex flex-col gap-3"
    >
      {/* §8 — ordre voulu par le spec : point faible (1 tap si absent) → variante proposée. */}
      <BilanWeakPointCapture review={review} sessionId={sessionId} />
      <BilanVariantSuggestions review={review} sessionId={sessionId} />

      {plateausBroken.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(52,211,153,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#34d399" }}>
            <PartyPopper size={13} />
            Plateau débloqué
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{plateausBroken.join(", ")}</p>
        </div>
      )}

      {enteringPlateau.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
            <AlertTriangle size={13} />
            Plateau en cours
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{enteringPlateau.join(", ")}</p>
        </div>
      )}

      {antiPlateauFailed.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(251,113,133,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#fb7185" }}>
            <RotateCcw size={13} />
            Anti-plateau échoué : méthode à changer
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{antiPlateauFailed.join(", ")}</p>
        </div>
      )}

      {hasAmbitionInfo && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Ambition</p>
          <div className="mt-2 flex flex-col gap-1.5 text-sm">
            {tooAmbitious.length > 0 && (
              <p className="text-[--color-fg]">
                <span className="font-medium" style={{ color: "#fb7185" }}>
                  Trop haut
                </span>{" "}
                : ça t&apos;a coûté ({tooAmbitious.join(", ")})
              </p>
            )}
            {notAmbitiousEnough.length > 0 && (
              <p className="text-[--color-fg]">
                <span className="font-medium" style={{ color: "var(--accent)" }}>
                  Tu peux charger plus
                </span>{" "}
                : {notAmbitiousEnough.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
