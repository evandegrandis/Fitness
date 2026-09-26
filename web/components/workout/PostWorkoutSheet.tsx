"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { StatTile } from "@/components/ui/StatTile";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveRecoveryCheckin } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import type { RecoveryCheckin, WorkoutSession } from "@/lib/models/types";
import { hasAnyRecoveryValue, shouldPersistRecoveryValues } from "@/lib/models/recovery";
import {
  RecoveryCheckinRow,
  type RecoveryDraft,
} from "./RecoveryCheckinRow";
import { BilanHero } from "./bilan/BilanHero";
import { BilanPerformance } from "./bilan/BilanPerformance";
import { BilanPlateaus } from "./bilan/BilanPlateaus";
import { BilanCoverage } from "./bilan/BilanCoverage";
import { SessionCaloriesCard } from "@/components/history/SessionCalories";
import { useCareer } from "@/lib/hooks/use-career";
import type { SessionReview } from "@/lib/engines/bilan";
import { weeklyQuest } from "@/lib/engines/weekly-quest";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function draftFor(checkins: RecoveryCheckin[], date: Date): RecoveryDraft & { id: string | null } {
  const target = startOfDay(date).getTime();
  const existing = checkins.find((c) => startOfDay(c.date).getTime() === target);
  if (existing) {
    return {
      id: existing.id,
      tookCreatine: existing.tookCreatine,
      proteinTargetMet: existing.proteinTargetMet,
      sleepHours: existing.sleepHours,
      hadAlcohol: existing.hadAlcohol,
    };
  }
  return { id: null, tookCreatine: null, proteinTargetMet: null, sleepHours: null, hadAlcohol: null };
}

/** Feuille plein écran de bilan post-séance, avec recovery checkin J-1/J-2. */
export function PostWorkoutSheet({
  open,
  snapshot,
  session,
  onClose,
}: {
  open: boolean;
  snapshot: FinishedWorkoutSnapshot | null;
  /** Séance terminée à analyser — sert au bilan intelligent (`sessionReview`). */
  session: WorkoutSession | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} full>
      {open && snapshot && session && (
        <PostWorkoutContent key={session.id} snapshot={snapshot} session={session} onClose={onClose} />
      )}
    </Sheet>
  );
}

function PostWorkoutContent({
  snapshot,
  session,
  onClose,
}: {
  snapshot: FinishedWorkoutSnapshot;
  session: WorkoutSession;
  onClose: () => void;
}) {
  const recoveryCheckins = useWorkoutStore((s) => s.recoveryCheckins);
  const sessionReview = useWorkoutStore((s) => s.sessionReview);
  // VARIATION_CYCLING_SPEC §8 — `sessionReview()` masque `plateau.suggestedVariant` selon
  // `treatedVariantSuggestions` (lu en direct dans le store à l'appel, pas capturé par closure) :
  // sans cette dépendance, accepter/refuser dans `BilanPlateaus` ne referait pas recalculer `review`
  // (le `useMemo` ci-dessous ne verrait aucun changement de `session`/`sessionReview`) et la carte
  // ne disparaîtrait pas malgré la doc "disparaît une fois traitée" (§8).
  const treatedVariantSuggestions = useWorkoutStore((s) => s.treatedVariantSuggestions);
  // VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — même piège de réactivité pour la capture 1-tap : la
  // capture (`setPlateauWeakPoint`) mute `state.history`, PAS `session` (référence figée reçue en
  // prop). `sessionReview()` relit désormais toujours la copie fraîche par id (fix store), mais le
  // `useMemo` lui-même ne recalculerait jamais sans une dépendance qui change réellement à la
  // capture — `history` (nouvelle référence à chaque mutation immuable du store) joue ce rôle.
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  // Le parcours se recalcule sur tout l'historique (quelques centaines de ms) : on le lance une fois
  // la feuille ouverte, pour ne pas saccader son animation.
  const [careerReady, setCareerReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCareerReady(true), 380);
    return () => clearTimeout(id);
  }, []);
  const referenceDate = session.endTime ?? session.date;

  const d1Date = useMemo(() => addDays(referenceDate, -1), [referenceDate]);
  const d2Date = useMemo(() => addDays(referenceDate, -2), [referenceDate]);

  const [d1, setD1] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d1Date));
  const [d2, setD2] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d2Date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = useMemo(() => {
    // Ces deux valeurs sont des déclencheurs de recalcul : `sessionReview`
    // relit leur état frais dans le store même si sa propre référence reste stable.
    void treatedVariantSuggestions;
    void history;
    return sessionReview(session);
  }, [session, sessionReview, treatedVariantSuggestions, history]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const mutations = [
        { date: d1Date, draft: d1 },
        { date: d2Date, draft: d2 },
      ]
        .flatMap(({ date, draft }) => {
          const existing = draftFor(recoveryCheckins, date);
          if (!shouldPersistRecoveryValues(existing.id, draft)) return [];
          return [{
            id: existing.id ?? crypto.randomUUID(),
            date: startOfDay(date),
            tookCreatine: draft.tookCreatine,
            proteinTargetMet: draft.proteinTargetMet,
            sleepHours: draft.sleepHours,
            hadAlcohol: draft.hadAlcohol,
          }];
        });
      if (mutations.length > 0) {
        // Le bilan doit rester réellement offline-first : la récupération influence ensuite le
        // mode Beast et ne peut pas être perdue alors que la séance, elle, est bien en outbox.
        for (const checkin of mutations) {
          await writeThrough(
            { kind: "recovery_checkin", checkin },
            () => saveRecoveryCheckin(checkin)
          );
          // Le write est désormais durable soit sur Neon, soit dans l'outbox. Seulement à ce
          // moment-là, refléter l'upsert ou la suppression dans le cache local.
          useWorkoutStore.setState((state) => {
            const targetDay = startOfDay(checkin.date).getTime();
            const withoutTarget = state.recoveryCheckins.filter(
              (candidate) => startOfDay(candidate.date).getTime() !== targetDay
            );
            if (!hasAnyRecoveryValue(checkin)) {
              return { recoveryCheckins: withoutTarget };
            }
            return {
              recoveryCheckins: [...withoutTarget, checkin].sort(
                (a, b) => b.date.getTime() - a.date.getTime()
              ),
            };
          });
        }
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer la récupération.");
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="flex flex-col gap-5 pb-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Bilan express</p>
          <h2 className="font-display text-2xl font-bold text-accent-gradient">Séance terminée</h2>
        </header>

        {careerReady ? <SessionRankHero review={review} session={session} /> : <div aria-hidden className="h-[108px]" />}

        <div className="grid grid-cols-3 gap-2">
          <StatTile value={snapshot.duration} label="Durée" />
          <StatTile value={snapshot.setCount} label="Séries" />
          <StatTile value={snapshot.exerciseCount} label="Exos" />
        </div>

        <SessionCaloriesCard session={session} exercises={catalog} />

        <BilanPerformance exercises={review.exercises} />

        <BilanPlateaus review={review} sessionId={session.id} />

        <BilanCoverage review={review} />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Récupération</p>
          <RecoveryCheckinRow label="Hier (J-1)" value={d1} onChange={setD1} />
          <RecoveryCheckinRow label="Avant-hier (J-2)" value={d2} onChange={setD2} />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="btn-accent w-full py-3.5 text-base disabled:opacity-60 active:scale-[0.98] transition"
        >
          {saving ? "Sauvegarde…" : "Enregistrer les jours confirmés & fermer"}
        </button>
      </div>
  );
}

/** Rang et déblocages de la séance, lus dans le parcours, plus la quête si la séance l'a bouclée. */
function SessionRankHero({ review, session }: { review: SessionReview; session: WorkoutSession }) {
  const careerSession = useCareer().bySession.get(session.id);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const checkins = useWorkoutStore((s) => s.recoveryCheckins);
  const unlocks = useMemo(() => {
    const quest = weeklyQuest({ history, catalog, goals, checkins, now: session.date });
    const before = weeklyQuest({ history: history.filter((past) => past.id !== session.id), catalog, goals, checkins, now: session.date });
    const questDone = quest?.completed && before && !before.completed && before.parent === quest.parent;
    return [
      ...(questDone ? [{ kind: "quest" as const, label: `${quest.label}, ${quest.target} séries` }] : []),
      ...(careerSession?.unlocks ?? []),
    ];
  }, [careerSession, history, catalog, goals, checkins, session]);
  return <BilanHero review={review} rank={careerSession?.rank ?? null} unlocks={unlocks} />;
}
