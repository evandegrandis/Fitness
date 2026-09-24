"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Trash2 } from "lucide-react";

const ACTION_WIDTH = 76;
const OPEN_THRESHOLD = 40;
const OPEN_VELOCITY = 400;
const DELETE_RATIO = 0.4;
const DELETE_FLICK_OFFSET = 24;
const DELETE_FLICK_VELOCITY = 900;
const FALLBACK_WIDTH = 340;

type SwipeAction = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
};

/**
 * Ligne à gestes pour une carte d'exercice pendant la séance :
 * - swipe DROITE : suppression DIRECTE dès qu'un seuil franc est dépassé
 *   (~40% de la largeur, ou flick rapide) — pas de bouton intermédiaire à
 *   re-cliquer. Le store (`removeExercise`) pousse déjà un snapshot d'undo
 *   consommé par `UndoToast`, donc le geste reste réversible.
 * - swipe GAUCHE : révèle les actions secondaires (Dupliquer / Remplacer),
 *   qui restent affichées jusqu'à un tap sur une action ou une fermeture.
 *
 * Le drag de réordonnancement (poignée ⋮⋮, dnd-kit) est exclu de ce
 * composant : le drag horizontal est démarré manuellement via
 * `useDragControls`, et `onPointerDown` ignore tout pointeur qui démarre sur
 * un élément marqué `data-drag-handle` — dnd-kit reste seul maître du geste
 * sur la poignée (voir ExerciseCard + activationConstraint delay dans
 * ExerciseList).
 */
export function SwipeRow({
  children,
  actions = [],
  onDelete,
}: {
  children: React.ReactNode;
  /** Actions secondaires révélées au swipe GAUCHE. Vide = seul le swipe droite (supprimer) est actif. */
  actions?: SwipeAction[];
  onDelete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const revealWidth = actions.length * ACTION_WIDTH;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(el.offsetWidth || FALLBACK_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const deleteThreshold = width * DELETE_RATIO;
  const rightDragLimit = Math.max(200, deleteThreshold * 1.6);
  const dangerOpacity = useTransform(x, [0, deleteThreshold], [0, 1]);
  const dangerScale = useTransform(x, [0, deleteThreshold], [0.85, 1.08]);
  const actionsOpacity = useTransform(x, [-revealWidth, 0], [1, 0]);

  const close = () => {
    setOpen(false);
    animate(x, 0, { type: "spring", stiffness: 420, damping: 42 });
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-drag-handle]")) return;
    dragControls.start(event);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const draggedRight =
      info.offset.x > deleteThreshold || (info.offset.x > DELETE_FLICK_OFFSET && info.velocity.x > DELETE_FLICK_VELOCITY);
    if (draggedRight) {
      // Suppression directe : la carte glisse hors champ (clippée par
      // overflow-hidden du conteneur) puis le store est mis à jour — l'undo
      // reste disponible via UndoToast.
      void animate(x, width + 40, {
        type: "tween",
        duration: 0.16,
        ease: "easeIn",
        onComplete: onDelete,
      });
      return;
    }

    const draggedLeft =
      revealWidth > 0 && (info.offset.x < -OPEN_THRESHOLD || info.velocity.x < -OPEN_VELOCITY);
    if (draggedLeft) {
      setOpen(true);
      animate(x, -revealWidth, { type: "spring", stiffness: 420, damping: 42 });
    } else {
      close();
    }
  };

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl">
      {/* Fond suppression (danger), révélé par le swipe DROITE */}
      <motion.div
        className="absolute inset-0 flex items-center gap-2 pl-6"
        style={{ background: "var(--color-danger)", opacity: dangerOpacity }}
      >
        <motion.span style={{ scale: dangerScale }} className="flex items-center gap-2 text-[#1a0f0a]">
          <Trash2 size={18} />
          <span className="font-mono text-[0.65rem] font-bold uppercase tracking-wider">Supprimer</span>
        </motion.span>
      </motion.div>

      {/* Actions (Dupliquer / Remplacer), révélées par le swipe GAUCHE */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: revealWidth, opacity: actionsOpacity }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              close();
              action.onClick();
            }}
            className="flex flex-col items-center justify-center gap-1 font-mono text-[0.62rem] font-bold uppercase tracking-wider text-(--color-fg) active:opacity-70 transition"
            style={{ width: ACTION_WIDTH, background: "rgba(236,230,216,0.12)" }}
          >
            <action.icon size={16} />
            {action.label}
          </button>
        ))}
      </motion.div>

      <motion.div
        drag="x"
        dragListener={false}
        dragControls={dragControls}
        dragDirectionLock
        dragConstraints={{ left: -revealWidth, right: rightDragLimit }}
        dragElastic={{ left: 0.05, right: 0.06 }}
        style={{ x }}
        onPointerDown={handlePointerDown}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (open) close();
        }}
        className="relative z-10 bg-[var(--bg-top)]"
      >
        {children}
      </motion.div>
    </div>
  );
}
