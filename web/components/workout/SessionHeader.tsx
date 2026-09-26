"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Cloud, CloudOff, Loader2, Swords, WifiOff } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { bossDefeated, sessionGame } from "@/lib/engines/session-game";
import {
  cutAt,
  nextRankPlan,
  rankLetter,
  rankParts,
  rankScore,
  SESSION_RANK,
  type RankInput,
} from "@/lib/engines/session-rank";
import { RANK_COLORS } from "@/lib/theme/tiers";
import { useWorkoutStore } from "@/lib/store/workout";
import { useSyncStatus } from "@/lib/sync/status";
import { SessionFocusButton } from "./SessionFocusSheet";
import { formatDecimal, formatLoad } from "@/lib/format";

/** Badge de synchronisation HONNÊTE : reflète l'état réel, jamais un faux « enregistré ». */
function SyncBadge() {
  const status = useSyncStatus((s) => s.status);
  const pending = useSyncStatus((s) => s.pending);

  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-(--color-fg-faint)">
        <Loader2 size={12} className="animate-spin" /> enregistrement…
      </span>
    );
  if (status === "offline")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem]" style={{ color: "var(--color-warning)" }}>
        <WifiOff size={12} /> en attente de réseau{pending > 1 ? ` (${pending})` : ""}
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-(--color-danger)">
        <CloudOff size={12} /> non synchronisé{pending > 1 ? ` (${pending})` : ""}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[0.7rem]" style={{ color: "var(--color-success)" }}>
      <Cloud size={12} /> enregistré
    </span>
  );
}

function formatElapsed(startTime: Date, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startTime.getTime()) / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}:${String(secs).padStart(2, "0")}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const GOLD = "var(--color-warning)";
const PART_LABELS = { sets: "Séries", records: "Records" } as const;

/**
 * Rang de la séance en cours, et le chemin le plus court vers le suivant : des séries de plus, ou
 * des records. Un tap déplie les deux objectifs du rang.
 */
function LiveRankRow({ input }: { input: RankInput }) {
  const [open, setOpen] = useState(false);
  const score = rankScore(input);
  const letter = rankLetter(score);
  const color = RANK_COLORS[letter];
  const plan = nextRankPlan(input);
  const paths = plan
    ? [
        plan.sets !== null ? `${plan.sets} série${plan.sets > 1 ? "s" : ""} de plus` : null,
        plan.records !== null ? `${plan.records} record${plan.records > 1 ? "s" : ""}` : null,
      ].filter(Boolean)
    : [];
  const fullRecords = input.cut ? SESSION_RANK.FULL_RECORDS_CUT : SESSION_RANK.FULL_RECORDS;
  const detail: Record<keyof typeof PART_LABELS, string> = {
    sets: `${formatDecimal(input.sets)} / ${SESSION_RANK.FULL_SETS}`,
    records: `${input.records} / ${fullRecords}${input.cut ? " (sèche)" : ""}`,
  };
  const radius = 11;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2.5 text-left text-xs">
        <span className="relative grid h-7 w-7 shrink-0 place-items-center">
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
        <p className="min-w-0 flex-1 leading-snug">
          <span className="font-semibold" style={{ color }}>
            Rang {letter}
          </span>
          <span className="text-(--color-fg-muted)">
            {plan ? ` · pour ${plan.letter} : ${paths.join(" ou ")}` : " · le plus haut rang"}
          </span>
        </p>
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

/**
 * En-tête de séance active : durée live, séries faites, suggestions battues et combo (le jeu de la
 * séance, session-game.ts), boss du jour, bouton Terminer. Rien ici ne touche aux suggestions.
 */
export function SessionHeader({
  session,
  onFinish,
  onFocusExercise,
}: {
  session: WorkoutSession;
  onFinish: () => void;
  onFocusExercise?: (loggedExerciseId: string) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const justHitRecord = useWorkoutStore((s) => s.justHitRecord);
  const sessionBoss = useWorkoutStore((s) => s.sessionBoss);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSets = Math.round(
    session.exercises.reduce((acc, exercise) => acc + physiologicalSetUnits(exercise.sets), 0) * 10
  ) / 10;
  const game = useMemo(() => sessionGame(session, catalog, history), [session, catalog, history]);
  const rankInput = useMemo<RankInput>(() => {
    const done = session.exercises.flatMap((logged) => logged.sets.filter((set) => set.completed));
    const known = new Set(
      history
        .filter((past) => !past.isActive && past.id !== session.id)
        .flatMap((past) => past.exercises.filter((logged) => logged.sets.some((set) => set.completed)).map((logged) => logged.exerciseId))
    );
    return {
      sets: totalSets,
      records: done.filter((set) => justHitRecord[set.id] !== undefined).length,
      cut: cutAt(session.startTime, bodyWeights, settings),
      recordsPossible: session.exercises.some((logged) => known.has(logged.exerciseId)),
    };
  }, [session, history, justHitRecord, totalSets, bodyWeights, settings]);
  const boss = sessionBoss?.sessionId === session.id ? sessionBoss.boss : null;
  const defeated = boss ? bossDefeated(boss, session, justHitRecord) : false;

  return (
    <div className="glass glass-strong glass-card">
      <div className="flex items-center justify-between gap-3">
        <p className="tnum font-display text-2xl font-bold text-(--color-fg)">{formatElapsed(session.startTime, nowMs)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <SessionFocusButton session={session} onExerciseSelected={onFocusExercise} />
          <button
            type="button"
            onClick={() => {
              if (confirmFinish) {
                onFinish();
                setConfirmFinish(false);
              } else {
                setConfirmFinish(true);
                setTimeout(() => setConfirmFinish(false), 3000);
              }
            }}
            className="btn-accent flex items-center gap-1.5 px-4 py-2.5 text-sm active:scale-95 transition"
          >
            <Check size={16} />
            {confirmFinish ? "Confirmer ?" : "Terminer"}
          </button>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-xs text-(--color-fg-muted)">
        <span className="tabular-nums">
          {formatDecimal(totalSets)} série{totalSets > 1 ? "s" : ""} faite{totalSets > 1 ? "s" : ""}
          {game.beaten > 0 && (
            <>
              {" · "}
              <span className="text-(--color-fg)">{game.beaten}</span> battue{game.beaten > 1 ? "s" : ""}
            </>
          )}
        </span>
        <AnimatePresence initial={false}>
          {game.combo >= 2 && (
            <motion.span
              key={game.combo}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
              className="rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold leading-none tabular-nums"
              style={{ color: GOLD, background: "color-mix(in srgb, var(--color-warning) 14%, transparent)" }}
              aria-label={`${game.combo} suggestions battues d'affilée`}
            >
              ×{game.combo}
            </motion.span>
          )}
        </AnimatePresence>
        <SyncBadge />
      </div>

      <LiveRankRow input={rankInput} />

      {boss && (
        <button
          type="button"
          onClick={() => onFocusExercise?.(boss.loggedExerciseId)}
          className="mt-3 flex w-full items-center gap-2 border-t border-white/[0.06] pt-3 text-left text-xs transition active:opacity-70"
        >
          <Swords size={14} className="shrink-0" style={{ color: defeated ? GOLD : "var(--color-fg-muted)" }} />
          <span className="min-w-0 flex-1 truncate text-(--color-fg-muted)">
            <span className="text-(--color-fg)">Boss</span> · {boss.exerciseName}{" "}
            <span className="tabular-nums">
              {boss.levelName ? `passage ${boss.levelName}` : `${formatLoad(boss.weight)} × ${boss.reps}`}
            </span>
          </span>
          <motion.span
            key={defeated ? "vaincu" : "a-battre"}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className="shrink-0 font-semibold"
            style={{ color: defeated ? GOLD : "var(--color-fg-faint)" }}
          >
            {defeated ? "vaincu" : "à battre"}
          </motion.span>
        </button>
      )}
    </div>
  );
}
