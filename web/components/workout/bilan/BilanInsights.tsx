"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import type { ExerciseReview } from "@/lib/engines/bilan";
import type {
  InsightKind,
  SessionInsight,
  SessionInsights,
  SuggestionTally,
  SupersetSummary,
} from "@/lib/engines/session-insights";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<InsightKind, string> = {
  progress: "Progression",
  capacity: "Capacité du jour",
  fatigue: "Fatigue",
  superset: "Superset",
  suggestion: "Cibles",
  next: "Prochaine fois",
  week: "Semaine",
};

const TONE_COLOR: Record<SessionInsight["tone"], string> = {
  positive: "var(--color-success)",
  warning: "var(--color-warning)",
  neutral: "var(--line-strong)",
};

function duration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes === 0 ? `${rest} s` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function decimal(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/**
 * Ce que la séance apprend : trois enseignements en tête, chiffrés, puis tout le détail replié
 * (progression, supersets, fatigue, suggestion, prochaine fois, semaine, et chaque exercice face
 * à sa référence).
 */
export function BilanInsights({
  insights,
  exercises = [],
  defaultOpen = false,
}: {
  insights: SessionInsights;
  /** Exercice par exercice face à la suggestion de référence (`SessionReview.exercises`). */
  exercises?: ExerciseReview[];
  defaultOpen?: boolean;
}) {
  const extraDetail: ReactNode = exercises.length > 0 ? <ExerciseByExercise exercises={exercises} /> : null;
  const [open, setOpen] = useState(defaultOpen);
  const detailCount = insights.sections.reduce((sum, section) => sum + section.items.length, 0);
  if (insights.headline.length === 0 && !extraDetail) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="glass glass-card !p-0"
      aria-label="Ce que la séance t'apprend"
    >
      <div className="px-4 pt-4">
        <p className="eyebrow">Ce que la séance t&apos;apprend</p>
      </div>

      {insights.headline.length > 0 ? (
        <ol className="mt-3 flex flex-col">
          {insights.headline.map((insight, index) => (
            <li key={insight.id} className="relative border-t border-(--line) px-4 py-3.5 first:border-t-0">
              <span
                aria-hidden
                className="absolute left-0 top-4 bottom-4 w-[2px] rounded-full"
                style={{ background: TONE_COLOR[insight.tone] }}
              />
              <div className="flex items-baseline gap-2">
                <span className="tnum text-[0.66rem] text-(--color-fg-faint)">{String(index + 1).padStart(2, "0")}</span>
                <span className="eyebrow !text-[0.58rem]">{KIND_LABEL[insight.kind]}</span>
              </div>
              <p className="mt-1 font-display text-[0.97rem] font-semibold leading-snug text-(--color-fg)">{insight.title}</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-(--color-fg-muted)">{insight.detail}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 pb-1 pt-2 text-[0.78rem] text-(--color-fg-muted)">
          Pas assez d&apos;historique sur ces exercices pour en tirer un enseignement chiffré.
        </p>
      )}

      {(detailCount > insights.headline.length || extraDetail) && (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center justify-between border-t border-(--line) px-4 py-3 text-left"
          >
            <span className="eyebrow">Tout le détail · {detailCount}</span>
            <ChevronDown size={15} className={cn("text-(--color-fg-muted) transition-transform", open && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-5 border-t border-(--line) px-4 pb-4 pt-4">
                  {insights.sections.map((section) => (
                    <div key={section.kind}>
                      <p className="eyebrow !text-[0.6rem]">{section.label}</p>
                      {section.kind === "superset" && insights.supersets.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2">
                          {insights.supersets.map((summary, index) => (
                            <SupersetBlock key={index} summary={summary} />
                          ))}
                        </div>
                      )}
                      {section.kind === "suggestion" && insights.suggestionTally ? (
                        <SuggestionBlock tally={insights.suggestionTally} />
                      ) : (
                      <ul className="mt-2 flex flex-col gap-2.5">
                        {section.items.map((insight) => (
                          <li key={insight.id}>
                            <p className="text-[0.84rem] font-semibold leading-snug text-(--color-fg)">{insight.title}</p>
                            <p className="mt-0.5 text-[0.74rem] leading-relaxed text-(--color-fg-muted)">{insight.detail}</p>
                          </li>
                        ))}
                      </ul>
                      )}
                    </div>
                  ))}
                  {extraDetail}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.section>
  );
}

/**
 * Un superset en un coup d'œil : chaque exercice, son repos réel entre deux de ses séries et ses
 * reps par série, face à la même mesure quand il est fait seul (barre claire = superset).
 */
function SupersetBlock({ summary }: { summary: SupersetSummary }) {
  const maxRest = Math.max(1, ...summary.members.flatMap((member) => [member.restSeconds ?? 0, member.soloRestSeconds ?? 0]));
  const maxReps = Math.max(1, ...summary.members.flatMap((member) => [member.avgReps ?? 0, member.soloAvgReps ?? 0]));
  return (
    <div className="rounded-lg border border-(--line) px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="tnum text-[0.68rem] text-(--color-fg-muted)">
          {summary.linked ? "Lié" : "Alterné"} · {summary.rounds} tour{summary.rounds > 1 ? "s" : ""} · {duration(summary.durationSeconds)}
          {summary.soloEstimateSeconds !== null && ` (seuls ~${duration(summary.soloEstimateSeconds)})`}
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-2.5">
        {summary.members.map((member) => (
          <div key={member.exerciseId}>
            <p className="truncate text-[0.78rem] font-semibold text-(--color-fg)">{member.exerciseName}</p>
            <div className="mt-1 grid grid-cols-[3.4rem_1fr] items-center gap-x-2 gap-y-1">
              {member.restSeconds !== null && (
                <CompareRow
                  label="Repos"
                  today={member.restSeconds}
                  solo={member.soloRestSeconds}
                  max={maxRest}
                  format={duration}
                />
              )}
              {member.avgReps !== null && member.load !== null && (
                <CompareRow
                  label={member.load > 0 ? `${decimal(member.load)} kg` : "Reps"}
                  today={member.avgReps}
                  solo={member.soloAvgReps}
                  max={maxReps}
                  format={(value) => `${decimal(value)} reps`}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareRow({
  label,
  today,
  solo,
  max,
  format,
}: {
  label: string;
  today: number;
  solo: number | null;
  max: number;
  format: (value: number) => string;
}) {
  return (
    <>
      <span className="tnum text-[0.62rem] text-(--color-fg-faint)">{label}</span>
      <div className="flex flex-col gap-[3px]">
        <Bar value={today} max={max} strong text={format(today)} />
        {solo !== null && <Bar value={solo} max={max} text={`seul ${format(solo)}`} />}
      </div>
    </>
  );
}

function Bar({ value, max, strong = false, text }: { value: number; max: number; strong?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, Math.round((value / max) * 100))}%`, background: strong ? "var(--paper)" : "var(--line-strong)" }}
        />
      </div>
      <span className={cn("tnum w-[5.6rem] shrink-0 text-right text-[0.64rem]", strong ? "text-(--color-fg)" : "text-(--color-fg-faint)")}>
        {text}
      </span>
    </div>
  );
}

function setText(weight: number, reps: number): string {
  return weight > 0 ? `${decimal(weight)} kg × ${reps}` : `${reps} reps`;
}

/** Meilleure série de chaque exercice face à la référence de la séance (suggestion montrée). */
function ExerciseByExercise({ exercises }: { exercises: ExerciseReview[] }) {
  return (
    <div>
      <p className="eyebrow !text-[0.6rem]">Exercice par exercice</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {exercises.map((review) => {
          const color = review.calibrating
            ? "var(--color-fg-faint)"
            : review.performed
              ? "var(--color-success)"
              : "var(--color-warning)";
          const Arrow = review.calibrating ? null : review.performed ? ArrowUp : ArrowDown;
          return (
            <li key={review.loggedExerciseId} className="flex items-center justify-between gap-3 text-[0.78rem]">
              <span className="min-w-0 truncate text-(--color-fg)">{review.exerciseName}</span>
              <span className="tnum flex shrink-0 items-center gap-1 text-[0.68rem]" style={{ color }}>
                {Arrow && <Arrow size={11} />}
                {setText(review.achievedWeight, review.achievedReps)}
                <span className="text-(--color-fg-faint)">
                  {review.calibrating ? "· étalonnage" : `· réf. ${setText(review.referenceWeight, review.referenceReps)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Séries face à la suggestion montrée : la répartition, puis où elles sont passées en dessous. */
function SuggestionBlock({ tally }: { tally: SuggestionTally }) {
  const total = tally.beat + tally.met + tally.below;
  const parts = [
    { label: "battues", value: tally.beat, color: "var(--color-success)" },
    { label: "tenues", value: tally.met, color: "var(--paper)" },
    { label: "en dessous", value: tally.below, color: "var(--color-warning)" },
  ];
  const byExercise = new Map<string, { name: string; labels: string[] }>();
  for (const detail of tally.belowDetails) {
    const entry = byExercise.get(detail.exerciseId) ?? { name: detail.exerciseName, labels: [] };
    entry.labels.push(detail.label);
    byExercise.set(detail.exerciseId, entry);
  }
  return (
    <div className="mt-2">
      <div className="flex h-[6px] w-full gap-[2px] overflow-hidden rounded-full">
        {parts.filter((part) => part.value > 0).map((part) => (
          <div key={part.label} style={{ flex: part.value, background: part.color, opacity: part.label === "tenues" ? 0.55 : 0.9 }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {parts.map((part) => (
          <span key={part.label} className="tnum text-[0.66rem] text-(--color-fg-muted)">
            <span className="text-[0.8rem] font-bold" style={{ color: part.color }}>{part.value}</span> {part.label}
          </span>
        ))}
      </div>
      {byExercise.size > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {[...byExercise.values()].map((entry) => (
            <li key={entry.name}>
              <p className="text-[0.78rem] font-semibold text-(--color-fg)">{entry.name}</p>
              <p className="tnum text-[0.68rem] leading-relaxed text-(--color-fg-muted)">{entry.labels.join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      {tally.below > 0 && (
        <p className="mt-2 text-[0.68rem] text-(--color-fg-faint)">
          {tally.belowInSecondHalf} des {tally.below} en dessous dans la seconde moitié de la séance, sur {total} séries comparées.
        </p>
      )}
      {tally.oneInThree && (
        <p className="mt-1 text-[0.68rem] text-(--color-fg-faint)">
          {tally.beat} battue{tally.beat > 1 ? "s" : ""} sur {total} ; le moteur en attend une sur trois, soit {Math.round(total / 3)}.
        </p>
      )}
    </div>
  );
}
