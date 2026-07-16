"use client";

import { useRef, useState } from "react";
import { motion, useAnimation, type PanInfo } from "framer-motion";

const ACTION_WIDTH = 72;
const OPEN_THRESHOLD = 40;

/**
 * Ligne swipe-to-reveal : glisser vers la gauche découvre des actions
 * secondaires (Dupliquer / Supprimer) sans consommer le tap ni entrer en
 * conflit avec un drag-handle dédié (le drag vertical du parent utilise sa
 * propre poignée, jamais tout le corps de la carte).
 */
export function SwipeRow({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions: { label: string; icon: React.ComponentType<{ size?: number }>; onClick: () => void; danger?: boolean }[];
}) {
  const controls = useAnimation();
  const [open, setOpen] = useState(false);
  const revealWidth = actions.length * ACTION_WIDTH;
  const dragStartX = useRef(0);

  const close = () => {
    setOpen(false);
    void controls.start({ x: 0 });
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const draggedLeft = info.offset.x < -OPEN_THRESHOLD || info.velocity.x < -400;
    if (draggedLeft) {
      setOpen(true);
      void controls.start({ x: -revealWidth });
    } else {
      close();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: revealWidth }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              close();
              action.onClick();
            }}
            className={`flex flex-col items-center justify-center gap-1 text-[0.65rem] font-semibold active:opacity-70 transition ${
              action.danger ? "bg-rose-500/20 text-rose-300" : "bg-white/8 text-[--color-fg-muted]"
            }`}
            style={{ width: ACTION_WIDTH }}
          >
            <action.icon size={16} />
            {action.label}
          </button>
        ))}
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -revealWidth, right: 0 }}
        dragElastic={0.05}
        animate={controls}
        onDragStart={() => {
          dragStartX.current = 0;
        }}
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
