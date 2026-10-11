"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { WEEK_TIERS } from "@/lib/engines/progress-stats";
import { weekStatusText, type WeekStatus } from "@/lib/engines/week-status";
import { parentShortName } from "@/lib/models/muscles";
import { NO_TIER_COLOR, TIER_COLORS } from "@/lib/theme/tiers";

/**
 * La semaine pendant la séance : palier, séries qui manquent pour le suivant et où elles comptent.
 * Même calcul que l'accueil et le bilan (`week-status.ts`). Dans l'en-tête de séance, un tap ouvre
 * « Quoi faire maintenant » ; dans ce panneau, la même ligne sert d'en-tête, sans bouton.
 */
export function WeekStatusRow({
  status,
  lowerBodyOff,
  onOpen,
  bordered = true,
}: {
  status: WeekStatus;
  lowerBodyOff: boolean;
  onOpen?: () => void;
  bordered?: boolean;
}) {
  const text = weekStatusText(status, (parent) => parentShortName[parent].toLowerCase(), { lowerBodyOff });
  const color = status.tier ? TIER_COLORS[status.tier] : NO_TIER_COLOR;
  const target = status.next ? TIER_COLORS[status.next.tier] : color;
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const Wrapper = onOpen ? "button" : "div";

  return (
    <Wrapper
      {...(onOpen ? { type: "button" as const, onClick: onOpen, "aria-label": `${text.title}, ${text.next}. Voir quoi faire maintenant` } : {})}
      className={`flex w-full items-center gap-2.5 text-left text-xs ${bordered ? "mt-3 border-t border-white/[0.06] pt-3" : ""} ${onOpen ? "transition active:opacity-70" : ""}`}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center">
        <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="14" cy="14" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
          <motion.circle
            cx="14"
            cy="14"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - Math.min(1, status.score)) }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </svg>
        <span className="tnum relative text-[0.62rem] font-bold leading-none" style={{ color }}>
          {Math.round(status.score * 100)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5 leading-snug">
          <span className="shrink-0 whitespace-nowrap font-semibold" style={{ color: status.tier ? color : "var(--color-fg)" }}>
            {text.title}
          </span>
          <span className="min-w-0 truncate tabular-nums" style={{ color: text.near ? target : "var(--color-fg-muted)" }}>
            · {text.next}
          </span>
        </span>
        {/* Score de la semaine sur 100 %, avec les trois seuils (bronze, argent, or). */}
        <span className="relative mt-1.5 block h-[4px] overflow-hidden rounded-full bg-white/[0.07]">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: color }}
            initial={false}
            animate={{ width: `${Math.min(100, status.score * 100)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          {WEEK_TIERS.map((entry) => (
            <span
              key={entry.tier}
              aria-hidden
              className="absolute inset-y-0 w-[2px] -translate-x-1/2"
              style={{ left: `${entry.min * 100}%`, background: "rgba(11,11,12,0.9)" }}
            />
          ))}
        </span>
        {text.where && (
          <span className="mt-1.5 block truncate text-[0.68rem] tabular-nums text-(--color-fg-faint)">{text.where}</span>
        )}
      </span>
      {onOpen && <ChevronRight size={14} className="shrink-0 text-(--color-fg-faint)" aria-hidden />}
    </Wrapper>
  );
}
