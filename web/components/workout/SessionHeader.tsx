"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Cloud, CloudOff, Loader2, Swords, WifiOff } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";
import { bossDefeated, sessionGame } from "@/lib/engines/session-game";
import { sessionRankInput, type RankInput } from "@/lib/engines/session-rank";
import { LiveRankRow, useSessionCelebrations } from "@/components/celebrations/LiveRankRow";
import { useWorkoutStore } from "@/lib/store/workout";
import { useSyncStatus } from "@/lib/sync/status";
import { SessionFocusButton, SessionFocusSheet } from "./SessionFocusSheet";
import { WeekStatusRow } from "./WeekStatusRow";
import { weekKey, weekStatus, weekStatusText } from "@/lib/engines/week-status";
import { parentShortName } from "@/lib/models/muscles";
import { TIER_COLORS } from "@/lib/theme/tiers";
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
  const [focusOpen, setFocusOpen] = useState(false);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const lowerBodyOffWeek = useWorkoutStore((s) => s.lowerBodyOffWeek);
  const history = useWorkoutStore((s) => s.history);
  const justHitRecord = useWorkoutStore((s) => s.justHitRecord);
  const sessionBoss = useWorkoutStore((s) => s.sessionBoss);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Le rang en direct est celui que donnera le bilan pour les mêmes séries : même lecture (`sessionRankInput`,
  // étoiles de `session-stars.ts`), recalculée sur les faits à chaque changement, correction de série comprise.
  const rankInput = useMemo<RankInput>(
    () => sessionRankInput({ session, previous: history, catalog, bodyWeights, settings }),
    [session, history, catalog, bodyWeights, settings]
  );
  const totalSets = Math.round(rankInput.sets * 10) / 10;
  const game = useMemo(() => sessionGame(session, catalog, history), [session, catalog, history]);
  // La semaine en direct (Evan, 11/10/2026 : « à 3 séries d'une semaine or… si j'avais su ça durant
  // la séance, j'en aurais fait 3 de plus »). Même calcul que l'accueil et le bilan.
  const lowerBodyOff = lowerBodyOffWeek === weekKey(session.startTime);
  const week = useMemo(
    () => weekStatus(history, catalog, goals, new Date(), session, { lowerBodyOff }),
    [history, catalog, goals, session, lowerBodyOff]
  );
  // Au moment de terminer, si le palier suivant tient en quelques séries, on le redit.
  const weekText = weekStatusText(week, (parent) => parentShortName[parent].toLowerCase(), { lowerBodyOff });
  const finishHint =
    week.next && week.setsToNext !== null && week.setsToNext <= 6 && week.nextReachable
      ? {
          lead: `Encore ${week.setsToNext} série${week.setsToNext > 1 ? "s" : ""} pour la semaine en ${week.next.label.toLowerCase()}`,
          places: weekText.places,
        }
      : null;
  // Passage de rang, rang en vue, suggestion battue : joués par-dessus l'écran, sans rien bloquer.
  useSessionCelebrations(session.id, rankInput, game);
  const boss = sessionBoss?.sessionId === session.id ? sessionBoss.boss : null;
  const defeated = boss ? bossDefeated(boss, session, justHitRecord) : false;

  return (
    <div className="glass glass-strong glass-card">
      <div className="flex items-center justify-between gap-3">
        <p className="tnum font-display text-2xl font-bold text-(--color-fg)">{formatElapsed(session.startTime, nowMs)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <SessionFocusButton onOpen={() => setFocusOpen(true)} />
          <button
            type="button"
            onClick={() => {
              if (confirmFinish) {
                onFinish();
                setConfirmFinish(false);
              } else {
                setConfirmFinish(true);
                setTimeout(() => setConfirmFinish(false), finishHint ? 5000 : 3000);
              }
            }}
            className="btn-accent flex items-center gap-1.5 px-4 py-2.5 text-sm active:scale-95 transition"
          >
            <Check size={16} />
            {confirmFinish ? "Confirmer ?" : "Terminer"}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {confirmFinish && finishHint && week.next && (
          <motion.p
            key="finish-hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pt-2 text-xs leading-snug tabular-nums"
            role="status"
          >
            <span className="font-semibold" style={{ color: TIER_COLORS[week.next.tier] }}>
              {finishHint.lead}
            </span>
            {finishHint.places && <span className="text-(--color-fg-muted)"> : {finishHint.places}</span>}
          </motion.p>
        )}
      </AnimatePresence>

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
      <WeekStatusRow status={week} lowerBodyOff={lowerBodyOff} onOpen={() => setFocusOpen(true)} />
      <SessionFocusSheet
        open={focusOpen}
        onClose={() => setFocusOpen(false)}
        session={session}
        week={week}
        lowerBodyOff={lowerBodyOff}
        onExerciseSelected={onFocusExercise}
      />

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
