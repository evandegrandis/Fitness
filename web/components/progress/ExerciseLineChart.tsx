"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";

import { formatShortDate } from "@/components/progress/utils";

export interface ExercisePoint {
  date: Date;
  weight: number;
  reps: number;
  e1rm: number;
}

/**
 * Courbe principale poids meilleur set / séance avec scrub (survol/drag) et
 * bande de benchmark optionnelle. Échelle Y resserrée non-zéro. Une courbe
 * reps secondaire (orange) peut être superposée.
 */
export function ExerciseLineChart({
  points,
  benchmarkLow,
  benchmarkHigh,
  showReps = false,
  height = 200,
}: {
  points: ExercisePoint[];
  benchmarkLow?: number | null;
  benchmarkHigh?: number | null;
  showReps?: boolean;
  height?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = useMemo(
    () =>
      points.map((p, i) => ({
        idx: i,
        dateLabel: formatShortDate(p.date),
        weight: p.weight,
        reps: p.reps,
        e1rm: Math.round(p.e1rm * 10) / 10,
      })),
    [points]
  );

  const weights = data.map((d) => d.weight);
  const minW = Math.min(...weights, benchmarkLow ?? Infinity);
  const maxW = Math.max(...weights, benchmarkHigh ?? -Infinity);
  const pad = Math.max(1, (maxW - minW) * 0.15);
  const yDomain: [number, number] = [Math.max(0, Math.floor(minW - pad)), Math.ceil(maxW + pad)];

  const handleMove = useCallback((state: MouseHandlerDataParam) => {
    if (state?.isTooltipActive && typeof state.activeTooltipIndex === "number") {
      setActiveIndex(state.activeTooltipIndex);
    }
  }, []);

  const handleLeave = useCallback(() => setActiveIndex(null), []);

  const active = activeIndex !== null ? data[activeIndex] : data[data.length - 1];

  return (
    <div>
      {active && (
        <div className="mb-2 flex items-baseline gap-3">
          <span className="tnum text-2xl font-bold text-[--color-fg]">{active.weight} kg</span>
          <span className="tnum text-sm text-[--color-fg-muted]">{active.reps} reps</span>
          <span className="tnum text-xs text-[--color-fg-faint]">{active.dateLabel}</span>
        </div>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} onMouseMove={handleMove} onMouseLeave={handleLeave} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="weight"
              domain={yDomain}
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            {showReps && (
              <YAxis yAxisId="reps" orientation="right" hide domain={["dataMin - 2", "dataMax + 2"]} />
            )}
            {benchmarkLow != null && benchmarkHigh != null && (
              <ReferenceArea
                yAxisId="weight"
                y1={benchmarkLow}
                y2={benchmarkHigh}
                fill="var(--color-success)"
                fillOpacity={0.08}
                stroke="var(--color-success)"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--color-fg-faint)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={() => null}
            />
            <Line
              yAxisId="weight"
              type="monotone"
              dataKey="weight"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "#06070d", strokeWidth: 2 }}
            />
            {showReps && (
              <Line
                yAxisId="reps"
                type="monotone"
                dataKey="reps"
                stroke="var(--color-warning)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={{ r: 2, fill: "var(--color-warning)", strokeWidth: 0 }}
                activeDot={{ r: 4, fill: "var(--color-warning)", stroke: "#06070d", strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
