"use client";

import { useMemo, useState } from "react";
import { Star, TrendingUp } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { StatTile } from "@/components/ui/StatTile";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveRecoveryCheckin } from "@/lib/db/actions";
import { parentShortName } from "@/lib/models/muscles";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import type { RecoveryCheckin } from "@/lib/models/types";
import { RecoveryCheckinRow, type RecoveryDraft } from "./RecoveryCheckinRow";

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
  onClose,
}: {
  open: boolean;
  snapshot: FinishedWorkoutSnapshot | null;
  onClose: () => void;
}) {
  const recoveryCheckins = useWorkoutStore((s) => s.recoveryCheckins);
  const referenceDate = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const d1Date = useMemo(() => addDays(referenceDate, -1), [referenceDate]);
  const d2Date = useMemo(() => addDays(referenceDate, -2), [referenceDate]);

  const [d1, setD1] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d1Date));
  const [d2, setD2] = useState<RecoveryDraft>(() => draftFor(recoveryCheckins, d2Date));
  const [saving, setSaving] = useState(false);

  if (!snapshot) return null;

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
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Bilan express</p>
            <h2 className="font-display text-2xl font-bold text-accent-gradient">Séance terminée</h2>
          </div>
          <span className="pill" style={{ color: "var(--accent)" }}>
            <TrendingUp size={12} />
            {snapshot.progressionSignal}
          </span>
        </header>

        <div className="grid grid-cols-4 gap-2">
          <StatTile value={snapshot.duration} label="Durée" />
          <StatTile value={snapshot.setCount} label="Sets" />
          <StatTile value={snapshot.exerciseCount} label="Exos" />
          <StatTile value={snapshot.prCount} label="PR" accent={snapshot.prCount > 0} />
        </div>

        {snapshot.topMuscles.length > 0 && (
          <div className="glass glass-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Avancée musculaire</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {snapshot.topMuscles.map((m) => (
                <span key={m.parent} className="pill">
                  {parentShortName[m.parent]} +{m.sets}
                </span>
              ))}
            </div>
          </div>
        )}

        {snapshot.remainingMuscles.length > 0 && (
          <div className="glass glass-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">À couvrir</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {snapshot.remainingMuscles.map((m) => (
                <span key={m.parent} className="pill" style={{ color: "#fbbf24" }}>
                  {parentShortName[m.parent]} · {m.sets} restant{m.sets > 1 ? "s" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {snapshot.prHighlights.length > 0 && (
          <div className="glass glass-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">PR de séance</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {snapshot.prHighlights.map((pr, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-[--color-fg]">
                  <Star size={14} className="shrink-0 text-amber-300" fill="currentColor" />
                  <span className="font-medium">{pr.title}</span>
                  <span className="text-[--color-fg-muted]">{pr.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
