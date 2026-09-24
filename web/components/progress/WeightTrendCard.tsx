"use client";

import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { useWorkoutStore } from "@/lib/store/workout";
import { buildWeightTrend, WEIGHT_MILESTONES_PCT } from "@/lib/engines/body-weight";
import { trainingPhaseDisplayName } from "@/lib/models/enums";
import { formatChartNumber, yAxisWidth } from "@/components/progress/chart-axis";
import { formatDecimal } from "@/lib/format";

/**
 * Courbe de poids — tendance 7 jours, jamais la pesée brute.
 *
 * Les pesées brutes restent visibles en points de survol, mais la ligne et tous les chiffres
 * portent sur la moyenne mobile : sur une perte visée de ~400 g/semaine, la variation quotidienne
 * (±1,5 kg) noierait complètement le signal.
 */
export function WeightTrendCard() {
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);

  const trend = useMemo(
    () => buildWeightTrend(bodyWeights, settings.trainingPhaseStartedAt),
    [bodyWeights, settings.trainingPhaseStartedAt]
  );

  const data = useMemo(
    () =>
      trend.points.map((p) => ({
        date: p.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        tendance: p.smoothedKg,
        pesee: p.rawKg,
      })),
    [trend.points]
  );

  if (trend.currentKg === null || trend.startKg === null) {
    return (
      <GlassCard>
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Poids</p>
        <p className="mt-3 text-sm text-(--color-fg-muted)">
          Aucune pesée enregistrée. Ajoute-la depuis les réglages : c&apos;est le levier qui pèse le plus
          lourd, et l&apos;app ne peut rien en dire tant qu&apos;elle n&apos;a pas de point de départ.
        </p>
      </GlassCard>
    );
  }

  const milestoneLines = WEIGHT_MILESTONES_PCT.map((pct) => ({
    pct,
    kg: Math.round(trend.startKg! * (1 - pct / 100) * 10) / 10,
  }));
  const reached = new Set(trend.reachedMilestones);
  const min = Math.min(...data.map((d) => d.tendance), ...milestoneLines.map((m) => m.kg)) - 0.6;
  const max = Math.max(...data.map((d) => d.tendance)) + 0.6;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
          Poids{settings.trainingPhase ? ` · ${trainingPhaseDisplayName[settings.trainingPhase]}` : ""}
        </p>
        <span className="tnum text-lg font-bold text-(--color-fg)">{formatDecimal(trend.currentKg)} kg</span>
      </div>

      <p className="mt-1 text-xs text-(--color-fg-muted)">
        Tendance 7 jours · départ {formatDecimal(trend.startKg)} kg
        {trend.deltaKg !== null && Math.abs(trend.deltaKg) >= 0.05 && (
          <>
            {" · "}
            {trend.deltaKg > 0 ? "+" : "−"}
            {formatDecimal(Math.abs(trend.deltaKg))} kg
          </>
        )}
      </p>

      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              domain={[min, max]}
              tickFormatter={(value: number) => formatChartNumber(value, 1)}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth([min, max], 1, 10)}
            />
            <Tooltip
              contentStyle={{ background: "#101011", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "rgba(255,255,255,0.6)" }}
              formatter={(value, name) => [
                typeof value === "number" ? `${formatDecimal(value)} kg` : "–",
                name === "tendance" ? "Tendance" : "Pesée",
              ]}
            />
            {milestoneLines.map((m) => (
              <ReferenceLine
                key={m.pct}
                y={m.kg}
                stroke={reached.has(m.pct) ? "rgb(110,231,183)" : "rgba(255,255,255,0.2)"}
                strokeDasharray="4 4"
                label={{
                  value: `−${m.pct} %`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: reached.has(m.pct) ? "rgb(110,231,183)" : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
            <Area type="monotone" dataKey="tendance" stroke="var(--accent)" strokeWidth={2} fill="url(#weightFill)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {trend.reachedMilestones.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-emerald-300">
          Palier −{Math.max(...trend.reachedMilestones)} % atteint.
        </p>
      )}
      {trend.nextMilestonePct !== null && trend.kgToNextMilestone !== null && (
        <p className="mt-1 text-xs text-(--color-fg-muted)">
          Encore {formatDecimal(trend.kgToNextMilestone)} kg jusqu&apos;au palier −{trend.nextMilestonePct} %.
        </p>
      )}
    </GlassCard>
  );
}
