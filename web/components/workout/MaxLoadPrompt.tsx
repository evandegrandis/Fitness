"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

import { NO_MAX_LOAD } from "@/lib/engines/machine-max";
import { saveExercise } from "@/lib/sync/save-exercise";
import type { Exercise } from "@/lib/models/types";

/**
 * La charge max, demandée une seule fois par exercice chargé (Evan, 26/09/2026) : elle arrête les
 * suggestions au bout de la pile et fait exister « machine maxée ». Posée après la première série,
 * quand on est devant la machine et qu'on voit la pile. « Pas de max » est une réponse
 * (`maxLoad = 0`) : la question ne revient pas. Jamais pour un exercice au poids du corps.
 */
export function MaxLoadPrompt({ exercise }: { exercise: Exercise }) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  // Entrée puis la perte du focus au démontage enverraient deux fois la même réponse.
  const sent = useRef(false);

  async function answer(maxLoad: number) {
    if (sent.current) return;
    sent.current = true;
    try {
      await saveExercise({ ...exercise, maxLoad });
    } catch {
      sent.current = false;
      setFailed(true);
    }
  }

  function submit() {
    const parsed = Number.parseFloat(text.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000) void answer(parsed);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 rounded-2xl border border-white/[0.07] px-3 py-2"
    >
      <p className="min-w-0 flex-1 text-xs leading-snug text-(--color-fg-muted)">
        {failed ? "Pas enregistré, réessaie." : "Charge max ?"}
      </p>
      <label className="glass flex h-9 w-[5.25rem] shrink-0 items-center rounded-xl pr-2.5 focus-within:border-(--line-strong)">
        <input
          aria-label="Charge max de la machine, en kilos"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/[^\d.,]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          onBlur={submit}
          inputMode="decimal"
          enterKeyHint="done"
          placeholder="…"
          className="tnum min-w-0 flex-1 bg-transparent px-2.5 text-right text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
        />
        <span className="text-[0.7rem] text-(--color-fg-muted)">kg</span>
      </label>
      <button
        type="button"
        onClick={() => void answer(NO_MAX_LOAD)}
        className="shrink-0 py-2 text-xs text-(--color-fg-faint) transition active:opacity-60"
      >
        Pas de max
      </button>
    </motion.div>
  );
}
