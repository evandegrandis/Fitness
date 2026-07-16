"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { StatTile } from "@/components/ui/StatTile";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveRecoveryCheckin } from "@/lib/db/actions";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import type { RecoveryCheckin, WorkoutSession } from "@/lib/models/types";
import { RecoveryCheckinRow, type RecoveryDraft } from "./RecoveryCheckinRow";
import { BilanHero } from "./bilan/BilanHero";
import { BilanPerformance } from "./bilan/BilanPerformance";
import { BilanPlateaus } from "./bilan/BilanPlateaus";
import { BilanCoverage } from "./bilan/BilanCoverage";

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
    return { id: existing.id, tookCreatine: existing.tookCreatine, proteinTargetMet: existing.proteinTargetMet, sleepHours: existing.sleepHours };
  }
  return { id: null, tookCreatine: false, proteinTargetMet: false, sleepHours: 7 };
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
  const recoveryCheckins = useWorkoutStore((s) => s.recoveryCheckins);
  const sessionReview = useWorkoutStore((s) => s.sessionReview);
  const referenceDate = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const d1Date = useMemo(() => addDays(referenceDate, -1), [referenceDate]);
  const d2Date = useMemo(() => addDays(referenceDate, -2), [referenceDate]);

  const [d1, setD1] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d1Date));
  const [d2, setD2] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d2Date));
  const [saving, setSaving] = useState(false);

  const review = useMemo(() => (session ? sessionReview(session) : null), [session, sessionReview]);

  if (!snapshot || !review) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const d1Existing = draftFor(recoveryCheckins, d1Date);
      const d2Existing = draftFor(recoveryCheckins, d2Date);
      await Promise.all([
        saveRecoveryCheckin({
          id: d1Existing.id ?? crypto.randomUUID(),
          date: startOfDay(d1Date),
          tookCreatine: d1.tookCreatine,
          proteinTargetMet: d1.proteinTargetMet,
          sleepHours: d1.sleepHours,
        }),
        saveRecoveryCheckin({
          id: d2Existing.id ?? crypto.randomUUID(),
          date: startOfDay(d2Date),
          tookCreatine: d2.tookCreatine,
          proteinTargetMet: d2.proteinTargetMet,
          sleepHours: d2.sleepHours,
        }),
      ]);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} full>
      <div className="flex flex-col gap-5 pb-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Bilan express</p>
          <h2 className="font-display text-2xl font-bold text-accent-gradient">Séance terminée</h2>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <StatTile value={snapshot.duration} label="Durée" />
          <StatTile value={snapshot.setCount} label="Sets" />
          <StatTile value={snapshot.exerciseCount} label="Exos" />
        </div>

        <BilanHero review={review} />

        <BilanPerformance exercises={review.exercises} />

        <BilanPlateaus review={review} />

        <BilanCoverage review={review} />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Récupération</p>
          <RecoveryCheckinRow label="Hier (J-1)" value={d1} onChange={setD1} />
          <RecoveryCheckinRow label="Avant-hier (J-2)" value={d2} onChange={setD2} />
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="btn-accent w-full py-3.5 text-base disabled:opacity-60 active:scale-[0.98] transition"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder & fermer"}
        </button>
      </div>
    </Sheet>
  );
}
