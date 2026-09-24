"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";

import { formatShortDate } from "@/components/progress/utils";
import { formatChartNumber, yAxisWidth } from "@/components/progress/chart-axis";
import type { ExerciseAxis } from "@/lib/engines/progress-stats";
import { cleanWeight, formatDecimal } from "@/lib/format";

export interface ExercisePoint {
  date: Date;
  /** Meilleure série de la séance (celle qui a démontré le plus de capacité). */
  weight: number;
  reps: number;
  /** Capacité à frais de la séance : 1RM estimé en kg, ou reps jusqu'à l'échec au poids du corps. */
  capacity: number;
  records: number;
  /** Machine équivalente d'origine quand la charge a été convertie (lib/engines/equivalence.ts). */
  convertedFrom?: string;
}

/** Nombre de points à partir duquel on affiche le Brush (zoom/pan) — en dessous, 10 points tiennent déjà à l'écran. */
const ZOOM_THRESHOLD = 12;
const GOLD = "var(--color-warning)";

/**
 * Courbe de capacité d'un exercice : la même mesure que son statut (lib/engines/progress-stats.ts),
 * donc une courbe qui monte quand la carte dit « en progrès ». Le survol montre la vraie série.
 * Points creux : machine équivalente convertie ; points dorés : séance à record.
 */
export function ExerciseLineChart({
  points,
  axis,
  height = 190,
}: {
  points: ExercisePoint[];
  axis: ExerciseAxis;
  height?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = useMemo(
    () =>
      points.map((point, idx) => ({
        idx,
        dateLabel: formatShortDate(point.date),
        value: Math.round(point.capacity * 10) / 10,
        weight: point.weight,
        reps: point.reps,
        records: point.records,
        convertedFrom: point.convertedFrom,
      })),
    [points]
  );

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = Math.max(1, (maxValue - minValue) * 0.15);
  const yDomain: [number, number] = [Math.max(0, Math.floor(minValue - pad)), Math.ceil(maxValue + pad)];

  const handleMove = useCallback((state: MouseHandlerDataParam) => {
    if (state?.isTooltipActive && typeof state.activeTooltipIndex === "number") {
      setActiveIndex(state.activeTooltipIndex);
    }
  }, []);
  const handleLeave = useCallback(() => setActiveIndex(null), []);

  const active = activeIndex !== null ? data[activeIndex] : data[data.length - 1];
  const showZoom = data.length >= ZOOM_THRESHOLD;

  return (
    <div>
      {active && (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="tnum text-xl font-bold text-(--color-fg)">
            {active.weight > 0 ? `${cleanWeight(active.weight)} kg × ${active.reps}` : `${active.reps} reps`}
          </span>
          <span className="tnum text-xs text-(--color-fg-muted)">
            {axis === "load" ? `1RM est. ${formatDecimal(active.value)} kg` : `≈ ${formatDecimal(active.value)} à frais`}
          </span>
          <span className="tnum text-xs text-(--color-fg-faint)">
            {active.dateLabel}
            {active.convertedFrom && ` · ${active.convertedFrom}, converti`}
            {active.records > 0 && <span style={{ color: GOLD }}> · ★ {active.records}</span>}
          </span>
        </div>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} onMouseMove={handleMove} onMouseLeave={handleLeave} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yDomain}
              allowDecimals={false}
              tickFormatter={(value: number) => formatChartNumber(value, 0)}
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={yAxisWidth(yDomain, 0, 10)}
            />
            <Tooltip cursor={{ stroke: "var(--color-fg-faint)", strokeWidth: 1, strokeDasharray: "3 3" }} content={() => null} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.2}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: { convertedFrom?: string; records?: number } }) => {
                const record = (props.payload?.records ?? 0) > 0;
                const converted = !!props.payload?.convertedFrom;
                return (
                  <circle
                    key={`dot-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={record ? 3.6 : 2.8}
                    fill={converted ? "transparent" : record ? GOLD : "var(--accent)"}
                    stroke={record ? GOLD : "var(--accent)"}
                    strokeWidth={converted ? 1.5 : 0}
                  />
                );
              }}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "#06070d", strokeWidth: 2 }}
            />
            {showZoom && (
              <Brush
                dataKey="dateLabel"
                height={22}
                travellerWidth={10}
                stroke="var(--accent)"
                fill="rgba(255,255,255,0.04)"
                tickFormatter={() => ""}
                startIndex={Math.max(0, data.length - Math.max(ZOOM_THRESHOLD, Math.ceil(data.length / 2)))}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
