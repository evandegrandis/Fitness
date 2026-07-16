"use client";

import { motion } from "framer-motion";
import { AlertTriangle, PartyPopper, RotateCcw } from "lucide-react";
import type { SessionReview } from "@/lib/engines/bilan";

/** Plateaux cassés / en cours, et anti-plateau échoué (méthode à changer). */
export function BilanPlateaus({ review }: { review: SessionReview }) {
  const { plateausBroken, enteringPlateau, antiPlateauFailed, tooAmbitious, notAmbitiousEnough } = review;

  const hasPlateauInfo = plateausBroken.length > 0 || enteringPlateau.length > 0 || antiPlateauFailed.length > 0;
  const hasAmbitionInfo = tooAmbitious.length > 0 || notAmbitiousEnough.length > 0;

  if (!hasPlateauInfo && !hasAmbitionInfo) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="flex flex-col gap-3"
    >
      {plateausBroken.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(52,211,153,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#34d399" }}>
            <PartyPopper size={13} />
            Plateau débloqué
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{plateausBroken.join(", ")}</p>
        </div>
      )}

      {enteringPlateau.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
            <AlertTriangle size={13} />
            Plateau en cours
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{enteringPlateau.join(", ")}</p>
        </div>
      )}

      {antiPlateauFailed.length > 0 && (
        <div className="glass glass-card" style={{ borderColor: "rgba(251,113,133,0.35)" }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#fb7185" }}>
            <RotateCcw size={13} />
            Anti-plateau échoué — méthode à changer
          </p>
          <p className="mt-1.5 text-sm text-[--color-fg]">{antiPlateauFailed.join(", ")}</p>
        </div>
      )}

      {hasAmbitionInfo && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Ambition</p>
          <div className="mt-2 flex flex-col gap-1.5 text-sm">
            {tooAmbitious.length > 0 && (
              <p className="text-[--color-fg]">
                <span className="font-medium" style={{ color: "#fb7185" }}>
                  Trop haut
                </span>{" "}
                — ça t&apos;a coûté : {tooAmbitious.join(", ")}
              </p>
            )}
            {notAmbitiousEnough.length > 0 && (
              <p className="text-[--color-fg]">
                <span className="font-medium" style={{ color: "var(--accent)" }}>
                  Tu peux charger plus
                </span>{" "}
                : {notAmbitiousEnough.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
