"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, Unlink, X } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  clearSupersetLinkNotice,
  endSupersetLinkMode,
  isSupersetLinkTap,
  SUPERSET_LINK_END_REASONS,
  SUPERSET_LINK_NOTICE_MS,
  SUPERSET_LINK_TIMEOUT_MS,
  useSupersetLinkNotice,
  watchSupersetLinkMode,
} from "@/lib/store/superset-link-mode";

/**
 * Bas du bandeau, mesuré le 15/10/2026. La barre d'onglets est une pilule de 68 px posée sur
 * max(0,75rem, encoche) : le bandeau se pose 8 px au-dessus (il était à 4,5rem, 8 px DESSOUS, et la
 * barre, peinte après lui, le masquait). Pendant le repos, 8 px au-dessus du minuteur, posé à
 * 6,25rem + encoche, qu'il chevauchait aussi : la hauteur du minuteur dépend de la largeur (86 px à
 * 390 px, 118 px à 320 px, son texte passe sur deux lignes), elle est donc mesurée.
 */
const ABOVE_TAB_BAR = "calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.75rem)";
const aboveRestTimer = (restTimerHeight: number) => `calc(env(safe-area-inset-bottom) + 6.75rem + ${restTimerHeight}px)`;
const REST_TIMER_HEIGHT_FALLBACK = 86;

/** Hauteur de mise en page du minuteur de repos (sans son animation d'entrée), suivie s'il change. */
function useRestTimerHeight(restActive: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!restActive) return;
    const element = document.querySelector<HTMLElement>("[data-rest-timer]");
    if (!element) return;
    // Un ResizeObserver notifie aussi à l'observation : la première mesure arrive sans attendre.
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [restActive]);
  return restActive ? height : null;
}

/**
 * Bandeau du mode « lier en superset ». Il dit quoi faire, montre le temps qui reste (un filet qui
 * se vide en 15 s) et, quand le mode s'arrête tout seul, dit pourquoi en une ligne, au même endroit,
 * le temps de la lire. Règles de fin : `lib/store/superset-link-mode.ts`.
 */
export function SupersetLinkBanner() {
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);
  const active = useWorkoutStore((s) => s.active);
  const restActive = useWorkoutStore((s) => s.rest !== null);
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);
  const notice = useSupersetLinkNotice((s) => s.notice);
  const restTimerHeight = useRestTimerHeight(restActive);

  const armedExercise = active?.exercises.find((e) => e.id === armedSupersetExerciseId);
  const armedId = armedExercise?.id ?? null;

  // Délai, série validée, écran quitté (changement d'onglet, fin de séance).
  useEffect(() => watchSupersetLinkMode(), []);

  // Un tap hors des exercices qu'on peut lier arrête le mode. Un défilement ne produit pas de clic.
  useEffect(() => {
    if (armedId === null) return;
    const onClick = (event: MouseEvent) => {
      if (!isSupersetLinkTap(event.target)) endSupersetLinkMode("tap_elsewhere");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [armedId]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => clearSupersetLinkNotice(notice.id), SUPERSET_LINK_NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const visible = armedExercise !== undefined || notice !== null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="superset-link-banner"
          role="status"
          aria-live="polite"
          data-superset-link=""
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className={`surface-solid fixed inset-x-0 z-40 mx-auto w-[calc(100%-2.5rem)] max-w-md overflow-hidden rounded-2xl ${
            armedExercise ? "" : "pointer-events-none"
          }`}
          style={{
            bottom: restActive ? aboveRestTimer(restTimerHeight ?? REST_TIMER_HEIGHT_FALLBACK) : ABOVE_TAB_BAR,
            boxShadow: armedExercise ? "0 0 0 1px var(--accent), 0 10px 34px rgba(0,0,0,0.6)" : undefined,
          }}
        >
          <div className="flex items-center gap-3 py-2.5 pl-4 pr-2">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={
                armedExercise
                  ? { background: "rgba(255,138,61,0.15)", color: "#ff8a3d" }
                  : { background: "rgba(236,230,216,0.06)", color: "var(--color-fg-muted)" }
              }
            >
              {armedExercise ? <Link2 size={15} aria-hidden /> : <Unlink size={15} aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-(--color-fg)">
                {armedExercise ? "Lier en superset" : "Superset annulé"}
              </p>
              <p className="text-xs leading-snug text-(--color-fg-muted)">
                {armedExercise
                  ? "Touche un autre exercice\u00a0·\u00a04\u00a0max"
                  : notice
                    ? SUPERSET_LINK_END_REASONS[notice.reason]
                    : null}
              </p>
            </div>
            {armedExercise && (
              <button
                type="button"
                onClick={() => handleSupersetLink(armedExercise.id)}
                aria-label="Annuler le superset"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-(--color-fg-muted) transition active:scale-90 active:bg-white/[0.06]"
              >
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
          {/* Le temps qui reste avant que le mode ne s'arrête seul. */}
          {armedExercise && (
            <motion.span
              key={armedExercise.id}
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
              style={{ background: "#ff8a3d" }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: SUPERSET_LINK_TIMEOUT_MS / 1000, ease: "linear" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
