"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartNumber } from "@/components/progress/chart-axis";

export interface WeekDatum {
  key: string;
  label: string;
  value: number;
}

/**
 * BarChart hebdomadaire réutilisable — semaine sélectionnée en accent, ligne
 * d'objectif pointillée optionnelle, tap/clic pour sélectionner une semaine.
 *
 * Domaine Y explicite basé sur `dataMax` (jamais sur `goal`, qui ne doit
 * qu'annoter le graphe sans jamais l'étirer/l'écraser) : évite le graphe
 * "quasi vide" quand toutes les barres sont basses ou proches de zéro.
 */
export function WeeklyBarChart({
  data,
  selectedKey,
  onSelect,
  goal,
  unit = "séries",
  height = 160,
  gradientId = "progresBarActive",
}: {
  data: WeekDatum[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  goal?: number;
  unit?: string;
  height?: number;
  gradientId?: string;
}) {
  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const allNearZero = maxValue < 1;
  // Domaine explicite : au moins 1 unité de plafond pour ne jamais avoir un
  // graphe à plat silencieux, sinon 1.2x le max observé (jamais le goal, qui
  // ne doit être qu'une ligne de repère et ne peut donc jamais écraser les
  // barres si l'objectif dépasse largement le réalisé).
  const yMax = allNearZero ? 1 : Math.ceil(maxValue * 1.2);

  return (
    <div style={{ width: "100%", height }}>
      {allNearZero ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-semibold text-[--color-fg-muted]">Pas encore de volume sur cette période</p>
          <p className="text-xs text-[--color-fg-faint]">Les séances loguées apparaîtront ici.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, yMax]} hide />
            {goal !== undefined && goal > 0 && goal <= yMax && (
              <ReferenceLine
                y={goal}
                stroke="var(--color-fg-faint)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const datum = payload[0].payload as WeekDatum;
                return (
                  <div className="glass glass-strong rounded-xl px-3 py-2 text-xs">
                    <p className="font-semibold text-[--color-fg]">{datum.label}</p>
                    <p className="tnum text-[--color-fg-muted]">
                      {formatChartNumber(datum.value, 1)} {unit}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 2, 2]}
              onClick={(datum: unknown) => {
                const d = datum as { key?: string };
                if (d?.key) onSelect(d.key);
              }}
              className="cursor-pointer"
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={6}
                formatter={(value: unknown) => (typeof value === "number" ? formatChartNumber(value, 1) : String(value ?? ""))}
                style={{ fill: "var(--color-fg-faint)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}
              />
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.key === selectedKey ? `url(#${gradientId})` : "rgba(255,255,255,0.35)"}
                  stroke={entry.key === selectedKey ? "transparent" : "rgba(255,255,255,0.42)"}
                  strokeWidth={entry.key === selectedKey ? 0 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
