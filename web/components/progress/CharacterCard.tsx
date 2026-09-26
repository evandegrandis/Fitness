"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { characterSheet, type CharacterKey, type CharacterStat } from "@/lib/engines/character";
import { useCareer } from "@/lib/hooks/use-career";
import { useWorkoutStore } from "@/lib/store/workout";

const SIZE = { width: 300, height: 214, cx: 150, cy: 116, radius: 70 };
/** Libellés posés hors du pentagone : décalage radial et alignement par sommet. */
const LABEL_OFFSET = 20;

function vertex(index: number, ratio: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
  return { x: SIZE.cx + Math.cos(angle) * SIZE.radius * ratio, y: SIZE.cy + Math.sin(angle) * SIZE.radius * ratio };
}

const polygon = (ratios: readonly number[]) => ratios.map((ratio, index) => vertex(index, ratio)).map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/**
 * Fiche de personnage : cinq caractéristiques sur un pentagone. Sous le pentagone, une
 * caractéristique est détaillée : comment elle se calcule, et le geste qui la ferait monter, en
 * points. Par défaut la plus faible (là où il y a le plus à gagner) ; un tap en détaille une autre.
 */
export function CharacterCard() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const checkins = useWorkoutStore((s) => s.recoveryCheckins);
  const settings = useWorkoutStore((s) => s.settings);
  const career = useCareer();
  const stats = useMemo(() => {
    const ranks = history.map((session) => ({ date: session.date, rank: career.bySession.get(session.id)?.rank ?? null }));
    return characterSheet({ history, catalog, goals, checkins, ranks, settings, now: new Date() });
  }, [history, catalog, goals, checkins, settings, career]);
  const [selected, setSelected] = useState<CharacterKey | null>(null);

  const known = stats.filter((stat) => stat.value !== null);
  const weakest = known.reduce<CharacterStat | null>((low, stat) => (!low || stat.value! < low.value! ? stat : low), null);
  const shown = stats.find((stat) => stat.key === selected) ?? weakest;
  const mean = known.length > 0 ? Math.round(known.reduce((sum, stat) => sum + stat.value!, 0) / known.length) : null;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Fiche</p>
        {mean !== null && <p className="tnum text-[0.68rem] text-(--color-fg-faint)">moyenne {mean}</p>}
      </div>

      <div className="relative mx-auto mt-1" style={{ maxWidth: SIZE.width, aspectRatio: `${SIZE.width} / ${SIZE.height}` }}>
        <svg viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {[1 / 3, 2 / 3, 1].map((ratio) => (
            <polygon key={ratio} points={polygon([ratio, ratio, ratio, ratio, ratio])} fill="none" stroke="rgba(236,230,216,0.08)" strokeWidth="1" />
          ))}
          {stats.map((stat, index) => {
            const end = vertex(index, 1);
            return <line key={stat.key} x1={SIZE.cx} y1={SIZE.cy} x2={end.x} y2={end.y} stroke="rgba(236,230,216,0.06)" strokeWidth="1" />;
          })}
          <motion.g
            style={{ transformOrigin: `${SIZE.cx}px ${SIZE.cy}px` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.1 }}
          >
            <polygon
              points={polygon(stats.map((stat) => (stat.value ?? 0) / 100))}
              fill="color-mix(in srgb, var(--accent) 16%, transparent)"
              stroke="var(--accent)"
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {stats.map((stat, index) => {
              const point = vertex(index, (stat.value ?? 0) / 100);
              return <circle key={stat.key} cx={point.x} cy={point.y} r={shown?.key === stat.key ? 3.2 : 2.2} fill="var(--accent)" />;
            })}
          </motion.g>
        </svg>

        {stats.map((stat, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
          const x = SIZE.cx + Math.cos(angle) * (SIZE.radius + LABEL_OFFSET);
          const y = SIZE.cy + Math.sin(angle) * (SIZE.radius + LABEL_OFFSET);
          const align = Math.abs(Math.cos(angle)) < 0.2 ? "center" : Math.cos(angle) > 0 ? "left" : "right";
          const active = shown?.key === stat.key;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => setSelected(stat.key)}
              aria-pressed={active}
              className="absolute flex flex-col leading-tight transition active:scale-95"
              style={{
                left: `${(x / SIZE.width) * 100}%`,
                top: `${(y / SIZE.height) * 100}%`,
                transform: `translate(${align === "center" ? "-50%" : align === "left" ? "0" : "-100%"}, ${index === 0 ? "-100%" : "-50%"})`,
                alignItems: align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end",
              }}
            >
              <span className="eyebrow !text-[0.55rem]" style={{ color: active ? "var(--color-fg)" : undefined }}>
                {stat.label}
              </span>
              <span className="tnum text-sm" style={{ color: active ? "var(--accent)" : "var(--color-fg)" }}>
                {stat.value ?? "–"}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {shown && (
          <motion.div
            key={shown.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 space-y-1.5 text-[0.72rem] leading-snug"
          >
            <p className="text-(--color-fg-muted)">
              <span className="font-semibold text-(--color-fg)">
                {shown.label} {shown.value ?? "–"}
              </span>{" "}
              · {shown.how}
            </p>
            {shown.next && (
              <p className="flex items-start gap-1.5 text-(--color-fg)">
                <ArrowUpRight size={13} className="mt-px shrink-0 text-(--accent)" />
                <span>Pour monter : {shown.next}</span>
              </p>
            )}
            {!selected && <p className="text-[0.66rem] text-(--color-fg-faint)">Touche une caractéristique pour la détailler.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
