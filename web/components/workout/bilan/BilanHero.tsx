"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Flag, Sparkles, Target } from "lucide-react";
import type { PerformanceLabel, SessionReview } from "@/lib/engines/bilan";
import type { CareerUnlock } from "@/lib/engines/career";
import type { SessionRank } from "@/lib/engines/session-rank";
import { RANK_COLORS } from "@/lib/theme/tiers";

const LABEL_COLOR: Record<PerformanceLabel, string> = {
  "Bonne séance": "#34d399",
  "En demi-teinte": "#fbbf24",
  Difficile: "#fb7185",
  "Séance d'étalonnage": "var(--accent)",
};

const GOLD = "var(--color-warning)";
const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Éclats autour de la médaille : un S se fête, un A se salue, B et C restent sobres. */
const BURST: Record<SessionRank["letter"], number> = { S: 14, A: 8, B: 0, C: 0 };

/**
 * En-tête du bilan. Avec un rang (session-rank.ts) : médaille S/A/B/C dont l'anneau se remplit du
 * score, puis ce qui a fait le rang et ce que la séance a débloqué (jalons, secrets). Sans rang
 * (séance d'étalonnage) : le signal de performance d'avant.
 */
export function BilanHero({
  review,
  rank = null,
  unlocks = [],
}: {
  review: SessionReview;
  rank?: SessionRank | null;
  unlocks?: readonly CareerUnlock[];
}) {
  if (!rank) return <PerformanceHero review={review} />;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass glass-card"
    >
      <div className="flex items-center gap-4">
        <RankMedal rank={rank} />
        <div className="min-w-0 flex-1">
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.3 }}
            className="font-display text-lg font-bold"
            style={{ color: RANK_COLORS[rank.letter] }}
          >
            Rang {rank.letter}
          </motion.p>
          <p className="mt-0.5 text-sm leading-snug text-(--color-fg-muted)">{rankReason(rank)}</p>
        </div>
      </div>

      {unlocks.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
          {unlocks.map((unlock, index) => (
            <motion.div
              key={unlock.kind === "milestone" ? `${unlock.family}-${unlock.tier}` : unlock.kind === "secret" ? unlock.id : "quete"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + index * 0.12, duration: 0.3 }}
              className="flex items-start gap-2 text-xs"
            >
              {unlock.kind === "milestone" ? (
                <Flag size={13} className="mt-px shrink-0 text-(--accent)" />
              ) : unlock.kind === "quest" ? (
                <Target size={13} className="mt-px shrink-0" style={{ color: GOLD }} />
              ) : (
                <Sparkles size={13} className="mt-px shrink-0" style={{ color: GOLD }} />
              )}
              <p className="min-w-0 leading-snug">
                <span className="text-(--color-fg)">{unlock.kind === "secret" ? unlock.title : unlock.label}</span>
                <span className="text-(--color-fg-faint)">
                  {unlock.kind === "milestone" ? " · jalon" : unlock.kind === "quest" ? " · quête accomplie" : " · secret découvert"}
                </span>
                {unlock.kind === "secret" && <span className="block text-(--color-fg-faint)">{unlock.description}</span>}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function rankReason(rank: SessionRank): string {
  const parts = [`${rank.performed}/${rank.rated} au-dessus`];
  if (rank.held > 0) parts.push(`${rank.held} tenu${rank.held > 1 ? "s" : ""}`);
  if (rank.records > 0) parts.push(`${rank.records} record${rank.records > 1 ? "s" : ""}`);
  if (rank.habitSets) {
    const volume = rank.effectiveSets / rank.habitSets;
    parts.push(volume >= 0.95 ? "volume habituel" : `volume ${Math.round(volume * 100)} %`);
  }
  if (rank.cut) parts.push("en sèche");
  return parts.join(" · ");
}

function RankMedal({ rank }: { rank: SessionRank }) {
  const reduced = useReducedMotion();
  const color = RANK_COLORS[rank.letter];
  const burst = reduced ? 0 : BURST[rank.letter];
  return (
    <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center">
      {burst > 0 && (
        <motion.span
          aria-hidden
          className="absolute inset-1 rounded-full"
          style={{ background: `radial-gradient(circle, color-mix(in srgb, ${color} 30%, transparent) 0%, transparent 70%)` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0.35], scale: [0.6, 1.25, 1] }}
          transition={{ delay: 0.55, duration: 1.1, ease: "easeOut" }}
        />
      )}
      {Array.from({ length: burst }, (_, index) => {
        const angle = (index / burst) * 2 * Math.PI + 0.3;
        const distance = 44 + (index % 3) * 6;
        return (
          <motion.span
            key={index}
            aria-hidden
            className="absolute h-1 w-1 rounded-full"
            style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
            transition={{ delay: 0.6 + (index % 4) * 0.03, duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
      <svg viewBox="0 0 72 72" className="absolute h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <motion.circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - rank.score / 100) }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </svg>
      <motion.span
        className="relative font-display text-3xl font-bold leading-none"
        style={{ color }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 380, damping: 18 }}
        aria-label={`Rang ${rank.letter}, ${rank.score} sur 100`}
      >
        {rank.letter}
      </motion.span>
    </div>
  );
}

/** Séance sans rang (étalonnage) : label de performance + jauge + phrase de synthèse. */
function PerformanceHero({ review }: { review: SessionReview }) {
  const calibrating = review.exercises.filter((e) => e.calibrating).length;
  const total = review.exercises.length - calibrating;
  const above = review.outperformed.length;
  const color = LABEL_COLOR[review.performanceLabel];
  const offset = CIRCUMFERENCE * (1 - review.performanceSignal / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass glass-card flex items-center gap-4"
    >
      <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <motion.circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </svg>
        <span className="tnum absolute text-sm font-bold" style={{ color }}>
          {review.performanceSignal}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold" style={{ color }}>
          {review.performanceLabel}
        </p>
        <p className="mt-0.5 text-sm text-(--color-fg-muted)">
          {total > 0
            ? `${above}/${total} exercice${total > 1 ? "s" : ""} au-dessus de tes suggestions`
            : calibrating > 0
              ? "Nouvelles machines : cette séance fixe tes références"
              : "Aucun exercice loggué"}
          {total > 0 && calibrating > 0 && ` · ${calibrating} en étalonnage`}
        </p>
      </div>
    </motion.div>
  );
}
