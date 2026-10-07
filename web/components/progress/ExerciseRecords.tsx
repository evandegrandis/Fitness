"use client";

import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import type { ExerciseRecordSheet } from "@/lib/engines/exercise-records";
import { cleanWeight } from "@/lib/format";

const GOLD = "var(--color-warning)";

function day(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
}

function setText(weight: number, reps: number): string {
  return weight > 0 ? `${cleanWeight(weight)} kg × ${reps}` : `${reps} reps`;
}

/**
 * Records de la machine (mêmes règles que les étoiles de l'Historique) : trois chiffres, puis les
 * cinq meilleures séances ; un tap ouvre la séance dans l'Historique.
 */
export function ExerciseRecords({ sheet }: { sheet: ExerciseRecordSheet }) {
  if (sheet.sessions === 0) return null;
  const tiles: { label: string; value: string; sub: string }[] = [];
  if (sheet.axis === "load") {
    if (sheet.heaviest) tiles.push({ label: "Charge max", value: `${cleanWeight(sheet.heaviest.weight)} kg`, sub: `× ${sheet.heaviest.reps} · ${day(sheet.heaviest.date)}` });
    // Le 1RM du record (Epley sur la série telle que faite, règle des étoiles), distinct de la
    // capacité « à frais » de la courbe au-dessus (RIR et fatigue de séance ajoutés).
    if (sheet.bestCapacity) tiles.push({ label: "Record 1RM", value: `${Math.round(sheet.bestCapacity.e1rm)} kg`, sub: `${cleanWeight(sheet.bestCapacity.weight)} × ${sheet.bestCapacity.reps} · ${day(sheet.bestCapacity.date)}` });
  } else if (sheet.mostReps) {
    tiles.push({ label: "Reps max", value: `${sheet.mostReps.reps}`, sub: day(sheet.mostReps.date) });
  }
  if (sheet.currentLoad && sheet.currentLoad.weight > 0) {
    tiles.push({ label: `À ${cleanWeight(sheet.currentLoad.weight)} kg`, value: `${sheet.currentLoad.bestReps} reps`, sub: `max · ${day(sheet.currentLoad.date)}` });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow !text-[0.6rem]">Records de la machine</p>
        {sheet.totalStars > 0 && (
          <span className="tnum flex items-center gap-1 text-[0.64rem]" style={{ color: GOLD }}>
            <Star size={10} fill={GOLD} /> {sheet.totalStars}
          </span>
        )}
      </div>
      {tiles.length > 0 && (
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map((tile) => (
            <div key={tile.label} className="min-w-0 rounded-lg border border-(--line) px-2.5 py-2">
              <p className="truncate text-[0.58rem] uppercase tracking-[0.12em] text-(--color-fg-faint)">{tile.label}</p>
              <p className="tnum mt-0.5 truncate text-[1rem] font-bold text-(--color-fg)">{tile.value}</p>
              <p className="tnum truncate text-[0.6rem] text-(--color-fg-muted)">{tile.sub}</p>
            </div>
          ))}
        </div>
      )}
      <p className="eyebrow mt-3 !text-[0.58rem]">
        {sheet.topSessions.length > 1 ? `${sheet.topSessions.length} meilleures séances` : "Meilleure séance"}
      </p>
      <ol className="mt-1.5 flex flex-col">
        {sheet.topSessions.map((entry, index) => (
          <li key={entry.sessionId}>
            <Link
              href={`/historique/${entry.sessionId}`}
              className="flex items-center gap-2.5 border-t border-(--line) py-2 first:border-t-0 active:opacity-70"
            >
              <span className="tnum w-4 text-[0.64rem] text-(--color-fg-faint)">{index + 1}</span>
              <span className="tnum w-14 shrink-0 text-[0.7rem] text-(--color-fg-muted)">{day(entry.date)}</span>
              <span className="tnum min-w-0 flex-1 truncate text-[0.8rem] font-semibold text-(--color-fg)">{setText(entry.weight, entry.reps)}</span>
              {sheet.axis === "load" && entry.weight > 0 && (
                <span className="tnum shrink-0 text-[0.64rem] text-(--color-fg-faint)">{Math.round(entry.value)} kg</span>
              )}
              {entry.calibration ? (
                <span className="shrink-0 text-[0.6rem] text-(--color-fg-faint)">étalonnage</span>
              ) : entry.stars > 0 ? (
                <span className="flex shrink-0 items-center gap-0.5 text-[0.64rem]" style={{ color: GOLD }}>
                  <Star size={10} fill={GOLD} />
                  {entry.stars > 1 ? entry.stars : ""}
                </span>
              ) : null}
              <ChevronRight size={13} className="shrink-0 text-(--color-fg-faint)" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
