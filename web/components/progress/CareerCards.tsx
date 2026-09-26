"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { levelName, MILESTONES, type MilestoneFamily, type MilestoneProgress, type SecretFound } from "@/lib/engines/career";
import { formatDecimal } from "@/lib/format";

const GOLD = "var(--color-warning)";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dayMonth = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

function thousands(value: number): string {
  return value.toLocaleString("fr-FR").replace(/ | /g, " ");
}

function valueText(family: MilestoneFamily, value: number): string {
  if (family === "level") return levelName(value) ?? "À découvrir";
  if (family === "weight") return value > 0 ? `−${formatDecimal(Math.round(value * 10) / 10)} %` : "0 %";
  if (family === "streak") return `${value} sem.`;
  return thousands(value);
}

function nextText(family: MilestoneFamily, next: number | null): string {
  if (next === null) return "tout atteint";
  if (family === "level") return `→ ${levelName(next) ?? ""}`;
  if (family === "weight") return `→ −${next} %`;
  return `→ ${thousands(next)}`;
}

/** Jalons à collectionner : où en est chaque famille, et le prochain palier. */
export function MilestonesCard({ milestones }: { milestones: readonly MilestoneProgress[] }) {
  const reached = milestones.reduce((sum, milestone) => sum + milestone.reached.length, 0);
  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Jalons</p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">
          {reached} atteint{reached > 1 ? "s" : ""}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
        {milestones.map((milestone, index) => (
          <div key={milestone.family} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="eyebrow truncate !text-[0.58rem]">{MILESTONES[milestone.family].label}</p>
              <p className={`${milestone.family === "level" ? "" : "tnum "}shrink-0 text-[0.62rem] text-(--color-fg-faint)`}>
                {nextText(milestone.family, milestone.next)}
              </p>
            </div>
            <p className={`${milestone.family === "level" ? "" : "tnum "}mt-0.5 truncate text-sm text-(--color-fg)`}>
              {valueText(milestone.family, milestone.value)}
            </p>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: milestone.next === null ? GOLD : "var(--accent)" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(milestone.fraction * 100)}%` }}
                transition={{ duration: 0.5, delay: 0.05 * index, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/**
 * Succès cachés déjà trouvés. Les autres n'apparaissent pas (Evan : « ne me les dis pas ») ; un
 * tap sur un secret rappelle ce qui l'a débloqué et quand.
 */
export function SecretsCard({ secrets }: { secrets: readonly SecretFound[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (secrets.length === 0) return null;
  const newestFirst = [...secrets].sort((a, b) => b.date.getTime() - a.date.getTime());
  const open = newestFirst.find((secret) => secret.id === selected) ?? null;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Secrets</p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">
          {secrets.length} découvert{secrets.length > 1 ? "s" : ""}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {newestFirst.map((secret, index) => {
          const active = secret.id === selected;
          return (
            <motion.button
              key={secret.id}
              type="button"
              onClick={() => setSelected(active ? null : secret.id)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.03 * index, duration: 0.25 }}
              aria-pressed={active}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] transition active:scale-95"
              style={{
                borderColor: active ? "color-mix(in srgb, var(--color-warning) 55%, transparent)" : "rgba(255,255,255,0.08)",
                background: active ? "color-mix(in srgb, var(--color-warning) 10%, transparent)" : "rgba(255,255,255,0.03)",
                color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
              }}
            >
              <Sparkles size={11} style={{ color: GOLD }} />
              {secret.title}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            key={open.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-[0.72rem] leading-snug text-(--color-fg-muted)"
          >
            <span className="block pt-3">
              {open.description} <span className="text-(--color-fg-faint)">· {dayMonth(open.date)}</span>
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      <p className="mt-3 text-[0.68rem] text-(--color-fg-faint)">D&apos;autres restent cachés.</p>
    </GlassCard>
  );
}
