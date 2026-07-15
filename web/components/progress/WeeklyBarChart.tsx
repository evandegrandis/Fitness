"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export interface WeekDatum {
  key: string;
  label: string;
  value: number;
}

/**
 * BarChart hebdomadaire réutilisable — semaine sélectionnée en accent, ligne
 * d'objectif pointillée optionnelle, tap/clic pour sélectionner une semaine.
 */
export function WeeklyBarChart({
  data,
  selectedKey,
  onSelect,
  goal,
  unit = "sets",
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
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
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
          {goal !== undefined && goal > 0 && (
            <ReferenceLine
              y={goal}
              stroke="var(--color-fg-faint)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
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
                    {datum.value} {unit}
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
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.key === selectedKey ? `url(#${gradientId})` : "rgba(255,255,255,0.14)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
