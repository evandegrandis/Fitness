"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { GlassCard } from "@/components/ui/GlassCard";
import { WeightTrendCard } from "@/components/progress/WeightTrendCard";
import { StatTile } from "@/components/ui/StatTile";
import { useWorkoutStore } from "@/lib/store/workout";
import { parentTotals } from "@/lib/engines/effective-sets";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import {
  aggregateCoefficient,
  type Exercise,
  type RecoveryCheckin,
  type WorkoutSession,
} from "@/lib/models/types";
import { comparableSessionPerformances } from "@/components/progress/global-analytics";
import { MUSCLE_PARENTS, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import { buildWeekBuckets, pearsonCorrelation, startOfDay, type WeekBucket } from "@/components/progress/utils";
import { WeeklyBarChart, type WeekDatum } from "@/components/progress/WeeklyBarChart";
import { MuscleRadar, type RadarDatum } from "@/components/progress/MuscleRadar";
import { CorrelationTile } from "@/components/progress/CorrelationTile";
import {
  recoverySessionsChronological,
  sleepHoursWithoutAlcohol,
} from "@/components/progress/recovery-analytics";

const WEEK_COUNT = 10;

export function GlobalLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const recoveryCheckins = useWorkoutStore((s) => s.recoveryCheckins);

  const buckets = useMemo(() => buildWeekBuckets(new Date(), WEEK_COUNT), []);
  const [selectedKey, setSelectedKey] = useState<string>(buckets[buckets.length - 1]?.label ?? "");
  const [radarParent, setRadarParent] = useState<MuscleParent | null>(null);

  const finished = useMemo(() => history.filter((s) => !s.isActive), [history]);
  const exerciseById = useMemo(() => new Map(catalog.map((exercise) => [exercise.id, exercise])), [catalog]);

  const weekVolumes: WeekDatum[] = useMemo(
    () =>
      buckets.map((b) => {
        const inRange = finished.filter((s) => s.date >= b.start && s.date < b.end);
        const sets = inRange.reduce((acc, session) => acc + effectiveSessionSets(session, exerciseById), 0);
        return { key: b.label, label: b.label, value: sets };
      }),
    [buckets, exerciseById, finished]
  );

  const avgVolume = useMemo(() => {
    if (weekVolumes.length === 0) return 0;
    return Math.round((weekVolumes.reduce((a, w) => a + w.value, 0) / weekVolumes.length) * 10) / 10;
  }, [weekVolumes]);

  const selectedBucket = buckets.find((b) => b.label === selectedKey) ?? buckets[buckets.length - 1];

  const selectedSnapshot = useMemo(() => {
    if (!selectedBucket) return null;
    const inRange = finished.filter((s) => s.date >= selectedBucket.start && s.date < selectedBucket.end);
    const sets = inRange.reduce((acc, session) => acc + effectiveSessionSets(session, exerciseById), 0);

    const checkinsInRange = recoveryCheckins.filter((c) => c.date >= selectedBucket.start && c.date < selectedBucket.end);
    let creatinePct: number | null = null;
    let proteinPct: number | null = null;
    let sleepAvg: number | null = null;
    let alcoholDays: number | null = null;
    if (checkinsInRange.length > 0) {
      const knownCreatine = checkinsInRange.filter((c) => c.tookCreatine !== null);
      const knownProtein = checkinsInRange.filter((c) => c.proteinTargetMet !== null);
      const knownAlcohol = checkinsInRange.filter((c) => c.hadAlcohol !== null);
      const knownSleepWithoutAlcohol = checkinsInRange.filter(
        (c): c is RecoveryCheckin & { sleepHours: number } =>
          sleepHoursWithoutAlcohol(c) !== null
      );
      if (knownCreatine.length > 0) {
        creatinePct = Math.round((knownCreatine.filter((c) => c.tookCreatine === true).length / knownCreatine.length) * 100);
      }
      if (knownProtein.length > 0) {
        proteinPct = Math.round((knownProtein.filter((c) => c.proteinTargetMet === true).length / knownProtein.length) * 100);
      }
      if (knownAlcohol.length > 0) alcoholDays = knownAlcohol.filter((c) => c.hadAlcohol === true).length;
      if (knownSleepWithoutAlcohol.length > 0) {
        sleepAvg =
          Math.round(
            (knownSleepWithoutAlcohol.reduce((a, c) => a + c.sleepHours, 0) / knownSleepWithoutAlcohol.length) * 10
          ) / 10;
      }
    }

    return { sets, sessionCount: inRange.length, creatinePct, proteinPct, sleepAvg, alcoholDays };
  }, [selectedBucket, finished, exerciseById, recoveryCheckins]);

  const radarData: RadarDatum[] = useMemo(() => {
    if (!selectedBucket) return [];
    const totals = parentTotals(finished, catalog, selectedBucket.start, selectedBucket.end);
    return MUSCLE_PARENTS.map((parent) => ({ parent, value: Math.round((totals.get(parent) ?? 0) * 10) / 10 }));
  }, [finished, catalog, selectedBucket]);

  const radarContribution = useMemo(() => {
    if (!radarParent || !selectedBucket) return [];
    return topContributingExercises(finished, catalog, radarParent, selectedBucket);
  }, [radarParent, selectedBucket, finished, catalog]);

  const correlations = useMemo(
    () => buildCorrelations(finished, exerciseById, recoveryCheckins),
    [finished, exerciseById, recoveryCheckins]
  );

  return (
    <div className="space-y-4">
      <WeightTrendCard />
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
              <StatTile value={`${selectedSnapshot.sleepAvg}h`} label="Sommeil sans alcool" />
            )}
            {selectedSnapshot.alcoholDays !== null && (
              <StatTile value={`${selectedSnapshot.alcoholDays} j`} label="Alcool" />
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
          Corrélations J-1/J-2 / performance vs prévision · 30 j
        </p>
        {correlations ? (
          <div className="grid grid-cols-2 gap-2">
            <CorrelationTile label="Créatine" r={correlations.creatine} />
            <CorrelationTile label="Protéines" r={correlations.protein} />
            <CorrelationTile label="Sommeil sans alcool" r={correlations.sleep} />
            <CorrelationTile label="Alcool" r={correlations.alcohol} />
            <p className="col-span-2 text-center text-[0.68rem] text-[--color-fg-faint]">
              {correlations.sampleCount} séances comparées à la meilleure performance de la séance précédente.
            </p>
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
      const completed = physiologicalSetUnits(logged.sets, {
        increment: exercise.smallestIncrement,
      });
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
  alcohol: number | null;
  sampleCount: number;
}

/**
 * Corrèle les check-ins J-1/J-2 avec le résidu de performance de la séance
 * suivante. La prévision est une baseline de persistance: meilleure performance
 * de la dernière séance comparable pour chaque exercice. Seules les séances des
 * 30 jours précédant la séance la plus récente sont analysées.
 */
function buildCorrelations(
  finished: WorkoutSession[],
  _exerciseById: Map<string, Exercise>,
  recoveryCheckins: RecoveryCheckin[]
): Correlations | null {
  if (finished.length < 2 || recoveryCheckins.length === 0) return null;

  const chronological = recoverySessionsChronological(finished);
  const latestDate = chronological.at(-1)!.date;
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - 30);
  const checkinByDay = new Map(recoveryCheckins.map((checkin) => [localDayKey(checkin.date), checkin]));
  const previousByExercise = new Map<string, { kind: "weighted" | "bodyweight"; score: number }>();
  const observations: { residual: number; recovery: RecoveryCheckin[] }[] = [];

  for (const session of chronological) {
    const deltas: number[] = [];
    for (const [exerciseId, performance] of comparableSessionPerformances(session, _exerciseById)) {
      const previous = previousByExercise.get(exerciseId);
      if (previous && previous.kind === performance.kind && previous.score > 0) {
        deltas.push(((performance.score - previous.score) / previous.score) * 100);
      }
      previousByExercise.set(exerciseId, performance);
    }
    if (session.date < cutoff || deltas.length === 0) continue;
    const recovery = [-1, -2]
      .map((offset) => checkinByDay.get(localDayKey(addLocalDays(session.date, offset))))
      .filter((checkin): checkin is RecoveryCheckin => checkin !== undefined);
    if (recovery.length === 0) continue;
    observations.push({
      residual: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
      recovery,
    });
  }

  if (observations.length < 3) return null;
  const correlate = (select: (checkin: RecoveryCheckin) => number | null): number | null => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const observation of observations) {
      const known = observation.recovery.map(select).filter((value): value is number => value !== null);
      if (known.length === 0) continue;
      xs.push(known.reduce((sum, value) => sum + value, 0) / known.length);
      ys.push(observation.residual);
    }
    return pearsonCorrelation(xs, ys);
  };

  return {
    creatine: correlate((checkin) => checkin.tookCreatine === null ? null : Number(checkin.tookCreatine)),
    protein: correlate((checkin) => checkin.proteinTargetMet === null ? null : Number(checkin.proteinTargetMet)),
    sleep: correlate(sleepHoursWithoutAlcohol),
    alcohol: correlate((checkin) => checkin.hadAlcohol === null ? null : Number(checkin.hadAlcohol)),
    sampleCount: observations.length,
  };
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addLocalDays(date: Date, offset: number): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + offset);
  return result;
}

function effectiveSessionSets(session: WorkoutSession, exerciseById: Map<string, Exercise>): number {
  const total = session.exercises.reduce((sum, logged) => {
    const increment = exerciseById.get(logged.exerciseId)?.smallestIncrement;
    return sum + physiologicalSetUnits(logged.sets, { increment });
  }, 0);
  return Math.round(total * 10) / 10;
}
