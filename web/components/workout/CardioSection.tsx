"use client";

import { useState } from "react";
import { HeartPulse, Plus, Trash2, X } from "lucide-react";

import type { CardioEntry } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";

function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining} s`;
  return remaining === 0 ? `${minutes} min` : `${minutes} min ${remaining} s`;
}

function optionalNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Bloc cardio de fin de séance, volontairement séparé du volume de musculation. */
export function CardioSection({ entries }: { entries: CardioEntry[] }) {
  const addCardioEntry = useWorkoutStore((state) => state.addCardioEntry);
  const deleteCardioEntry = useWorkoutStore((state) => state.deleteCardioEntry);
  const [editing, setEditing] = useState(false);
  const [activityName, setActivityName] = useState("Cardio");
  const [minutes, setMinutes] = useState("2");
  const [level, setLevel] = useState("");
  const [distanceKm, setDistanceKm] = useState("");

  const ordered = [...entries].sort((a, b) => a.orderIndex - b.orderIndex);
  const durationMinutes = Number(minutes);
  const canSave = Number.isFinite(durationMinutes) && durationMinutes > 0;

  const reset = () => {
    setActivityName("Cardio");
    setMinutes("2");
    setLevel("");
    setDistanceKm("");
    setEditing(false);
  };

  return (
    <section
      className="rounded-[1.75rem] border p-3.5"
      style={{ borderColor: "rgba(52,211,153,0.28)", background: "rgba(52,211,153,0.045)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-300">
            <HeartPulse size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[--color-fg]">Cardio · fin de séance</h3>
            <p className="text-[0.68rem] text-[--color-fg-faint]">Suivi séparé du volume muscu</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-[--color-fg-muted] active:scale-90 transition"
          aria-label={editing ? "Fermer le formulaire cardio" : "Ajouter un cardio"}
        >
          {editing ? <X size={17} /> : <Plus size={17} />}
        </button>
      </div>

      {ordered.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {ordered.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[--color-fg]">{entry.activityName}</p>
                <p className="text-xs text-[--color-fg-muted]">
                  {durationLabel(entry.durationSeconds)}
                  {entry.level != null ? ` · niveau ${entry.level}` : ""}
                  {entry.distanceKm != null ? ` · ${entry.distanceKm} km` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteCardioEntry(entry.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-rose-300 active:scale-90 transition"
                aria-label={`Supprimer ${entry.activityName}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3 rounded-2xl border border-white/8 bg-black/10 p-3">
          <label className="block text-[0.68rem] font-semibold uppercase tracking-wide text-[--color-fg-faint]">
            Activité
            <input
              value={activityName}
              onChange={(event) => setActivityName(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-[--color-fg] outline-none focus:border-emerald-300/50"
              placeholder="Cardio"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <NumericField label="Minutes" value={minutes} onChange={setMinutes} step="1" required />
            <NumericField label="Niveau" value={level} onChange={setLevel} step="1" />
            <NumericField label="Distance km" value={distanceKm} onChange={setDistanceKm} step="0.1" />
          </div>

          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              addCardioEntry({
                activityName,
                durationSeconds: Math.round(durationMinutes * 60),
                level: optionalNumber(level),
                distanceKm: optionalNumber(distanceKm),
              });
              reset();
            }}
            className="btn-accent mt-3 w-full py-2.5 text-sm disabled:opacity-50 active:scale-[0.98] transition"
          >
            Ajouter le cardio
          </button>
        </div>
      )}
    </section>
  );
}

function NumericField({
  label,
  value,
  onChange,
  step,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
  required?: boolean;
}) {
  return (
    <label className="min-w-0 text-[0.65rem] font-semibold text-[--color-fg-faint]">
      <span className="block truncate">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={required ? "0.1" : "0"}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 text-center text-sm text-[--color-fg] outline-none focus:border-emerald-300/50"
      />
    </label>
  );
}
