"use client";

import { useMemo, useState } from "react";
import { parentShortName, type MuscleParent } from "@/lib/models/muscles";

export interface RadarDatum {
  parent: MuscleParent;
  value: number;
}

const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_RADIUS = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * Radar musculaire custom SVG — pourcentage de l'objectif roulant 7 jours atteint par
 * MuscleParent. Recharts ne produit pas ce rendu
 * (labels radiaux + polygone dégradé + tap-to-select), donc SVG à la main.
 */
export function MuscleRadar({
  data,
  onSelect,
  selected,
}: {
  data: RadarDatum[];
  onSelect: (parent: MuscleParent) => void;
  selected: MuscleParent | null;
}) {
  const [hovered, setHovered] = useState<MuscleParent | null>(null);
  const points = useMemo(() => {
    const n = Math.max(1, data.length);
    return data.map(({ parent, value }, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const ratio = Math.min(1, Math.max(0, value / 100));
      const r = ratio * MAX_RADIUS;
      return {
        parent,
        value,
        ratio,
        x: CENTER + r * Math.cos(angle),
        y: CENTER + r * Math.sin(angle),
        labelX: CENTER + (MAX_RADIUS + 26) * Math.cos(angle),
        labelY: CENTER + (MAX_RADIUS + 26) * Math.sin(angle),
        axisX: CENTER + MAX_RADIUS * Math.cos(angle),
        axisY: CENTER + MAX_RADIUS * Math.sin(angle),
      };
    });
  }, [data]);

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const active = hovered ?? selected;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        height="auto"
        style={{ maxWidth: 340 }}
        role="img"
        aria-label="Pourcentage des objectifs musculaires atteint sur les 7 derniers jours"
      >
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-mint)" stopOpacity={0.35} />
          </linearGradient>
        </defs>

        {/* Cercles concentriques */}
        {RINGS.map((r) => (
          <circle
            key={r}
            cx={CENTER}
            cy={CENTER}
            r={r * MAX_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        {points.map((p) => (
          <line
            key={`axis-${p.parent}`}
            x1={CENTER}
            y1={CENTER}
            x2={p.axisX}
            y2={p.axisY}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Polygone de données */}
        <polygon points={polygonPath} fill="url(#radarFill)" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />

        {points.map((p) => (
          <circle
            key={`dot-${p.parent}`}
            cx={p.x}
            cy={p.y}
            r={active === p.parent ? 5 : 3.5}
            fill={active === p.parent ? "var(--accent)" : "var(--color-mint)"}
            stroke="#06070d"
            strokeWidth={1.5}
            className="transition-all"
          />
        ))}

        {/* Zones tappables + labels */}
        {points.map((p) => (
          <g
            key={`label-${p.parent}`}
            onClick={() => onSelect(p.parent)}
            onMouseEnter={() => setHovered(p.parent)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer"
          >
            <circle cx={p.labelX} cy={p.labelY} r={22} fill="transparent" />
            <text
              x={p.labelX}
              y={p.labelY - 3}
              textAnchor="middle"
              className="select-none text-[9px] font-semibold uppercase tracking-wide"
              style={{ fill: active === p.parent ? "var(--accent)" : "var(--color-fg-muted)" }}
            >
              {parentShortName[p.parent]}
            </text>
            <text
              x={p.labelX}
              y={p.labelY + 10}
              textAnchor="middle"
              className="tnum select-none text-[10px] font-bold"
              style={{ fill: "var(--color-fg)" }}
            >
              {`${Math.round(p.value)}%`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
