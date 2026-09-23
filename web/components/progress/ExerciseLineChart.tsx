"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";

import { formatShortDate, roundToIncrement } from "@/components/progress/utils";
import { trendBadge, type ExerciseProgressAxis } from "@/components/progress/trend";

export interface ExercisePoint {
  date: Date;
  weight: number;
  reps: number;
  e1rm: number;
  /** Machine équivalente d'origine quand la charge a été convertie (lib/engines/equivalence.ts). */
  convertedFrom?: string;
}

/** Nombre de points à partir duquel on affiche le Brush (zoom/pan) — en dessous, 10 points tiennent déjà à l'écran. */
const ZOOM_THRESHOLD = 12;

/**
 * Courbe principale (charge ou reps selon l'exercice) avec scrub (survol/drag) et
 * bande de benchmark optionnelle. Échelle Y resserrée non-zéro. Une courbe
 * reps secondaire (orange) peut être superposée. Badge de tendance dérivé de
 * la série ("Plateau N séances" / "+X% ce mois"). Zoom (Brush) uniquement
 * sur les séries longues.
 */
export function ExerciseLineChart({
  points,
  referenceBand,
  primaryAxis = "load",
  showReps = false,
  height = 200,
  smallestIncrement = 0.5,
}: {
  points: ExercisePoint[];
  /**
   * Bande avancé/élite déjà convertie dans l'unité du `weight` tracé ici
   * (charge loggée, pas la charge totale) — voir
   * `benchmarkBoundsForLoggedWeight` (lib/engines/benchmark.ts). `null`/
   * absent si l'exercice n'a pas de benchmark.
   */
  referenceBand?: { low: number; high: number } | null;
  primaryAxis?: ExerciseProgressAxis;
  showReps?: boolean;
  height?: number;
  /** Incrément de charge de l'exercice — arrondit le poids "lissé" affiché en tête. */
  smallestIncrement?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = useMemo(
    () =>
      points.map((p, i) => ({
        idx: i,
        dateLabel: formatShortDate(p.date),
        weight: p.weight,
        reps: p.reps,
        e1rm: roundToIncrement(p.e1rm, smallestIncrement),
        convertedFrom: p.convertedFrom,
      })),
    [points, smallestIncrement]
  );

  const trend = useMemo(
    () => trendBadge(points.map((p) => ({ date: p.date, value: primaryAxis === "reps" ? p.reps : p.weight }))),
    [points, primaryAxis]
  );

  const primaryValues = data.map((d) => (primaryAxis === "reps" ? d.reps : d.weight));
  const visibleReferenceBand = primaryAxis === "load" ? referenceBand : null;
  const minValue = Math.min(...primaryValues, visibleReferenceBand?.low ?? Infinity);
  const maxValue = Math.max(...primaryValues, visibleReferenceBand?.high ?? -Infinity);
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
      <div className="mb-2 flex items-start justify-between gap-2">
        {active && (
          <div className="flex items-baseline gap-3">
            <span className="tnum text-2xl font-bold text-[--color-fg]">
              {primaryAxis === "reps" ? `${active.reps} reps` : `${active.weight} kg`}
            </span>
            <span className="tnum text-sm text-[--color-fg-muted]">
              {primaryAxis === "reps" ? (active.weight > 0 ? `+${active.weight} kg` : "PDC") : `${active.reps} reps`}
            </span>
            <span className="tnum text-xs text-[--color-fg-faint]">
              {active.dateLabel}
              {active.convertedFrom && ` · ${active.convertedFrom}, converti`}
            </span>
          </div>
        )}
        {trend && (
          <span
            className="pill shrink-0"
            style={{
              color: trend.tone === "up" ? "var(--color-success)" : trend.tone === "down" ? "var(--color-danger)" : "var(--color-fg-muted)",
            }}
          >
            {trend.label}
          </span>
        )}
      </div>
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
              yAxisId="primary"
              domain={yDomain}
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            {showReps && primaryAxis === "load" && (
              <YAxis yAxisId="reps" orientation="right" hide domain={["dataMin - 2", "dataMax + 2"]} />
            )}
            {visibleReferenceBand && (
              <>
                <ReferenceArea
                  yAxisId="primary"
                  y1={visibleReferenceBand.low}
                  y2={visibleReferenceBand.high}
                  fill="var(--color-success)"
                  fillOpacity={0.07}
                  stroke="none"
                />
                <ReferenceLine yAxisId="primary" y={visibleReferenceBand.low} stroke="var(--color-warning)" strokeDasharray="4 4" strokeOpacity={0.55}>
                  <Label value="Avancé" position="insideBottomLeft" fill="var(--color-warning)" fontSize={9} fontFamily="var(--font-mono)" />
                </ReferenceLine>
                <ReferenceLine yAxisId="primary" y={visibleReferenceBand.high} stroke="var(--color-success)" strokeDasharray="4 4" strokeOpacity={0.55}>
                  <Label value="Élite" position="insideTopLeft" fill="var(--color-success)" fontSize={9} fontFamily="var(--font-mono)" />
                </ReferenceLine>
              </>
            )}
            <Tooltip
              cursor={{ stroke: "var(--color-fg-faint)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={() => null}
            />
            <Line
              yAxisId="primary"
              type="monotone"
              dataKey={primaryAxis === "reps" ? "reps" : "weight"}
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: { convertedFrom?: string } }) => (
                // Point creux = séance faite sur une machine équivalente, charge convertie.
                <circle
                  key={`dot-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={3}
                  fill={props.payload?.convertedFrom ? "transparent" : "var(--accent)"}
                  stroke="var(--accent)"
                  strokeWidth={props.payload?.convertedFrom ? 1.5 : 0}
                />
              )}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "#06070d", strokeWidth: 2 }}
            />
            {showReps && primaryAxis === "load" && (
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
