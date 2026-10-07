"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { formatDecimal } from "@/lib/format";
import { rankParts, SESSION_RANK, type RankInput } from "@/lib/engines/session-rank";
import { RANK_COLORS } from "@/lib/theme/tiers";
import { celebrate } from "./store";
import { initialCues, rankApproach, sessionCues, type CueState, type GameCounts } from "./session-cues";

const PART_LABELS = { sets: "Séries", records: "Records" } as const;
/** Au-delà, la jauge reste continue : des crans trop fins ne se lisent plus. */
const MAX_NOTCHES = 8;

/** État des célébrations par séance, gardé hors du composant : revenir sur l'onglet ne refête rien. */
const cueStates = new Map<string, CueState>();

/**
 * Joue les célébrations de la séance (passage de rang, rang en vue, suggestion battue) à chaque
 * série. Monté dans l'en-tête de séance ; ne bloque rien, ne touche à aucune suggestion.
 */
export function useSessionCelebrations(sessionId: string, input: RankInput, game: GameCounts) {
  const { beaten, combo } = game;
  useEffect(() => {
    const known = cueStates.get(sessionId);
    if (!known) {
      cueStates.set(sessionId, initialCues(input, { beaten, combo }));
      return;
    }
    const { events, state } = sessionCues(known, input, { beaten, combo });
    cueStates.set(sessionId, state);
    for (const event of events) celebrate(event);
  }, [sessionId, input, beaten, combo]);
}

/**
 * Rang de la séance en cours et l'approche du suivant : une jauge qui va du seuil du rang actuel à
 * celui du suivant, découpée en crans d'une série ; à deux séries ou un record, la ligne passe à
 * la couleur du rang visé et le prochain cran bat. Un tap déplie les deux objectifs du rang.
 */
export function LiveRankRow({ input }: { input: RankInput }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { score, letter, plan, fraction, near } = rankApproach(input);
  const color = RANK_COLORS[letter];
  const target = plan ? RANK_COLORS[plan.letter] : color;
  const fullRecords = input.cut ? SESSION_RANK.FULL_RECORDS_CUT : SESSION_RANK.FULL_RECORDS;
  const detail: Record<keyof typeof PART_LABELS, string> = {
    sets: `${formatDecimal(input.sets)} / ${SESSION_RANK.FULL_SETS}`,
    records: `${input.records} / ${fullRecords}${input.cut ? " (sèche)" : ""}`,
  };
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const notches = plan?.sets && plan.sets <= MAX_NOTCHES ? plan.sets : 0;

  // Éclat bref de la lettre quand le rang monte pendant que l'en-tête est à l'écran.
  const [seen, setSeen] = useState(letter);
  const [flash, setFlash] = useState(0);
  if (seen !== letter) {
    setSeen(letter);
    if ("CBAS".indexOf(letter) > "CBAS".indexOf(seen)) setFlash(flash + 1);
  }

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2.5 text-left text-xs">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center">
          <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90">
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
              animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </svg>
          {flash > 0 && !reduced && (
            <motion.span
              key={flash}
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 0 2px ${color}` }}
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          )}
          <motion.span
            key={letter}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            className="relative font-display text-sm font-bold leading-none"
            style={{ color }}
          >
            {letter}
          </motion.span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 leading-snug">
            <span className="shrink-0 whitespace-nowrap font-semibold" style={{ color }}>
              Rang {letter}
            </span>
            <span className="min-w-0 truncate" style={{ color: near ? target : "var(--color-fg-muted)" }}>
              {approachText(plan, near)}
            </span>
          </span>
          {/* Jauge d'approche : du seuil du rang actuel à celui du suivant. */}
          <span className="mt-1.5 flex items-center gap-2">
            <span className="relative h-[4px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: plan ? color : `linear-gradient(90deg, ${color}, #f4dca0)`, transformOrigin: "left" }}
                initial={false}
                animate={{ scaleX: fraction }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
              {notches > 0 &&
                Array.from({ length: notches }, (_, index) => {
                  // Crans répartis sur ce qui reste à faire ; le premier bat quand le rang est en vue.
                  const start = fraction + ((1 - fraction) * index) / notches;
                  const width = (1 - fraction) / notches;
                  const first = index === 0;
                  return (
                    <motion.span
                      key={`${plan?.letter}-${notches}-${index}`}
                      aria-hidden
                      className="absolute inset-y-0 rounded-full"
                      style={{ left: `calc(${start * 100}% + 2px)`, width: `calc(${width * 100}% - 2px)`, background: target }}
                      initial={{ opacity: 0.12 }}
                      animate={near && first && !reduced ? { opacity: [0.18, 0.75, 0.18] } : { opacity: first && near ? 0.6 : 0.12 }}
                      transition={near && first && !reduced ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                    />
                  );
                })}
            </span>
            <span className="w-3 shrink-0 text-center font-display text-[0.7rem] font-bold leading-none" style={{ color: target, opacity: plan ? (near ? 1 : 0.45) : 1 }}>
              {plan ? plan.letter : "★"}
            </span>
          </span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-(--color-fg-faint) transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 pt-3">
              {rankParts(input).map((part) => (
                <div key={part.key}>
                  <div className="flex items-baseline justify-between text-[0.7rem]">
                    <span className="text-(--color-fg-muted)">
                      {PART_LABELS[part.key]} <span className="text-(--color-fg-faint)">· {Math.round(part.weight * 100)} pts</span>
                    </span>
                    <span className="tabular-nums text-(--color-fg)">{detail[part.key]}</span>
                  </div>
                  <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div className="h-full rounded-full" style={{ background: color }} animate={{ width: `${Math.round(part.value * 100)}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-[0.66rem] leading-snug text-(--color-fg-faint)">
                Score {score} / 100. S dès {SESSION_RANK.THRESHOLDS.S}, A dès {SESSION_RANK.THRESHOLDS.A}, B dès {SESSION_RANK.THRESHOLDS.B}. Une série à
                RIR 3 compte 0,75, à RIR 4 ou plus 0,5 : les séries de plus s&apos;entendent à RIR 2 ou moins.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** « pour A : 3 séries ou 1 record », ou, en vue, « encore 1 série pour A ». */
export function approachText(plan: ReturnType<typeof rankApproach>["plan"], near: boolean): string {
  if (!plan) return "· le plus haut rang";
  const sets = plan.sets;
  const records = plan.records;
  if (near) {
    if (sets !== null && sets <= 2) return `· encore ${sets} série${sets > 1 ? "s" : ""} pour ${plan.letter}${records === 1 ? " ou 1 record" : ""}`;
    return `· 1 record et c'est ${plan.letter}`;
  }
  const paths = [
    sets !== null ? `${sets} série${sets > 1 ? "s" : ""}` : null,
    records !== null ? `${records} record${records > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return `· pour ${plan.letter} : ${paths.join(" ou ")}`;
}
