"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { GlassCard } from "@/components/ui/GlassCard";
import { StatTile } from "@/components/ui/StatTile";
import { useWorkoutStore } from "@/lib/store/workout";
import { parentTotals } from "@/lib/engines/effective-sets";
import { completedWorkSets, aggregateCoefficient, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { MUSCLE_PARENTS, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import { buildWeekBuckets, pearsonCorrelation, startOfDay, type WeekBucket } from "@/components/progress/utils";
import { WeeklyBarChart, type WeekDatum } from "@/components/progress/WeeklyBarChart";
import { MuscleRadar, type RadarDatum } from "@/components/progress/MuscleRadar";
import { CorrelationTile } from "@/components/progress/CorrelationTile";

const WEEK_COUNT = 10;

export function GlobalLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const recoveryCheckins = useWorkoutStore((s) => s.recoveryCheckins);

  const buckets = useMemo(() => buildWeekBuckets(new Date(), WEEK_COUNT), []);
  const [selectedKey, setSelectedKey] = useState<string>(buckets[buckets.length - 1]?.label ?? "");
  const [radarParent, setRadarParent] = useState<MuscleParent | null>(null);

  const finished = useMemo(() => history.filter((s) => !s.isActive), [history]);

  const weekVolumes: WeekDatum[] = useMemo(
    () =>
      buckets.map((b) => {
        const inRange = finished.filter((s) => s.date >= b.start && s.date < b.end);
        const sets = inRange.reduce((acc, s) => acc + s.exercises.reduce((a, e) => a + completedWorkSets(e).length, 0), 0);
        return { key: b.label, label: b.label, value: sets };
      }),
    [buckets, finished]
  );

  const avgVolume = useMemo(() => {
    if (weekVolumes.length === 0) return 0;
    return Math.round((weekVolumes.reduce((a, w) => a + w.value, 0) / weekVolumes.length) * 10) / 10;
  }, [weekVolumes]);

  const selectedBucket = buckets.find((b) => b.label === selectedKey) ?? buckets[buckets.length - 1];

  const selectedSnapshot = useMemo(() => {
    if (!selectedBucket) return null;
    const inRange = finished.filter((s) => s.date >= selectedBucket.start && s.date < selectedBucket.end);
    const sets = inRange.reduce((acc, s) => acc + s.exercises.reduce((a, e) => a + completedWorkSets(e).length, 0), 0);

    const checkinsInRange = recoveryCheckins.filter((c) => c.date >= selectedBucket.start && c.date < selectedBucket.end);
    let creatinePct: number | null = null;
    let proteinPct: number | null = null;
    let sleepAvg: number | null = null;
    if (checkinsInRange.length > 0) {
      creatinePct = Math.round((checkinsInRange.filter((c) => c.tookCreatine).length / checkinsInRange.length) * 100);
      proteinPct = Math.round((checkinsInRange.filter((c) => c.proteinTargetMet).length / checkinsInRange.length) * 100);
      sleepAvg = Math.round((checkinsInRange.reduce((a, c) => a + c.sleepHours, 0) / checkinsInRange.length) * 10) / 10;
    }

    return { sets, sessionCount: inRange.length, creatinePct, proteinPct, sleepAvg };
  }, [selectedBucket, finished, recoveryCheckins]);

  const radarData: RadarDatum[] = useMemo(() => {
    if (!selectedBucket) return [];
    const totals = parentTotals(finished, catalog, selectedBucket.start, selectedBucket.end);
    return MUSCLE_PARENTS.map((parent) => ({ parent, value: Math.round((totals.get(parent) ?? 0) * 10) / 10 }));
  }, [finished, catalog, selectedBucket]);

  const radarContribution = useMemo(() => {
    if (!radarParent || !selectedBucket) return [];
    return topContributingExercises(finished, catalog, radarParent, selectedBucket);
  }, [radarParent, selectedBucket, finished, catalog]);

  const correlations = useMemo(() => buildCorrelations(finished, recoveryCheckins), [finished, recoveryCheckins]);

  return (
    <div className="space-y-4">
      {/* Volume / semaine */}
      <GlassCard>
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[--color-fg]">Volume / semaine</p>
          <p className="text-xs text-[--color-fg-muted]">
            Moy. <span className="tnum text-[--color-fg]">{avgVolume}</span> sets
          </p>
        </div>
        <WeeklyBarChart
          data={weekVolumes}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          goal={avgVolume}
          unit="sets"
          gradientId="globalVolumeBar"
        />
      </GlassCard>

      {/* Snapshot semaine sélectionnée */}
      {selectedSnapshot && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">
            Semaine du {selectedBucket?.label}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile value={selectedSnapshot.sets} label="Sets" accent />
            <StatTile value={selectedSnapshot.sessionCount} label="Séances" />
            {selectedSnapshot.creatinePct !== null && (
              <StatTile value={`${selectedSnapshot.creatinePct}%`} label="Créatine" />
            )}
            {selectedSnapshot.proteinPct !== null && (
              <StatTile value={`${selectedSnapshot.proteinPct}%`} label="Protéines" />
            )}
            {selectedSnapshot.sleepAvg !== null && (
              <StatTile value={`${selectedSnapshot.sleepAvg}h`} label="Sommeil moy." className="col-span-2" />
            )}
          </div>
        </div>
      )}

      {/* Radar musculaire */}
      <GlassCard>
        <p className="mb-2 text-sm font-semibold text-[--color-fg]">
          Répartition musculaire — {selectedBucket?.label}
        </p>
        <MuscleRadar data={radarData} onSelect={setRadarParent} selected={radarParent} />

        <AnimatePresence>
          {radarParent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1.5 border-t border-white/8 pt-3">
                <p className="text-xs font-semibold text-[--color-fg]">
                  {parentDisplayName[radarParent]} — top exercices
                </p>
                {radarContribution.length === 0 ? (
                  <p className="text-xs text-[--color-fg-faint]">Aucune contribution cette semaine.</p>
                ) : (
                  radarContribution.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-[--color-fg-muted]">
                        <span className="tnum text-xs text-[--color-fg-faint]">{i + 1}</span>
                        {c.name}
                      </span>
                      <span className="tnum text-xs text-[--color-fg]">{Math.round(c.sets * 10) / 10} sets</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Corrélations */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">
          Corrélations récupération / volume
        </p>
        {correlations ? (
          <div className="grid grid-cols-3 gap-2">
            <CorrelationTile label="Créatine" r={correlations.creatine} />
            <CorrelationTile label="Protéines" r={correlations.protein} />
            <CorrelationTile label="Sommeil" r={correlations.sleep} />
          </div>
        ) : (
          <GlassCard className="text-center py-6">
            <p className="text-sm text-[--color-fg-muted]">
              Pas encore assez de check-ins de récupération pour calculer des corrélations.
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function topContributingExercises(
  finished: WorkoutSession[],
  catalog: Exercise[],
  parent: MuscleParent,
  bucket: WeekBucket
): { name: string; sets: number }[] {
  const exerciseIndex = new Map(catalog.map((e) => [e.id, e]));
  const totals = new Map<string, number>();
  const inRange = finished.filter((s) => s.date >= bucket.start && s.date < bucket.end);

  for (const session of inRange) {
    for (const logged of session.exercises) {
      const exercise = exerciseIndex.get(logged.exerciseId);
      if (!exercise) continue;
      const coeff = aggregateCoefficient(exercise, parent);
      if (coeff <= 0) continue;
      const completed = completedWorkSets(logged).length;
      if (completed <= 0) continue;
      totals.set(logged.exerciseName, (totals.get(logged.exerciseName) ?? 0) + completed * coeff);
    }
  }

  return [...totals.entries()]
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 6);
}

interface Correlations {
  creatine: number | null;
  protein: number | null;
  sleep: number | null;
}

/**
 * Corrèle, jour par jour sur les 30 derniers jours avec check-in, le volume
 * (sets de travail complétés ce jour-là) avec créatine (0/1), protéines
 * (0/1) et sommeil (heures).
 */
function buildCorrelations(
  finished: WorkoutSession[],
  recoveryCheckins: { date: Date; tookCreatine: boolean; proteinTargetMet: boolean; sleepHours: number }[]
): Correlations | null {
  if (recoveryCheckins.length < 3) return null;

  const volumeByDay = new Map<string, number>();
  for (const session of finished) {
    const key = startOfDay(session.date).toISOString();
    const sets = session.exercises.reduce((a, e) => a + completedWorkSets(e).length, 0);
    volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + sets);
  }

  const volumes: number[] = [];
  const creatine: number[] = [];
  const protein: number[] = [];
  const sleep: number[] = [];

  for (const c of recoveryCheckins) {
    const key = startOfDay(c.date).toISOString();
    const vol = volumeByDay.get(key) ?? 0;
    volumes.push(vol);
    creatine.push(c.tookCreatine ? 1 : 0);
    protein.push(c.proteinTargetMet ? 1 : 0);
    sleep.push(c.sleepHours);
  }

  return {
    creatine: pearsonCorrelation(creatine, volumes),
    protein: pearsonCorrelation(protein, volumes),
    sleep: pearsonCorrelation(sleep, volumes),
  };
}
