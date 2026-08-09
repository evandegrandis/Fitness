"use client";

import { useState } from "react";
import { HeartPulse, Plus, Trash2, X } from "lucide-react";

import type { CardioActivityType, CardioEntry } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";

const ACTIVITY_OPTIONS: { value: CardioActivityType; label: string }[] = [
  { value: "running", label: "Course" },
  { value: "rowing", label: "Rameur" },
  { value: "cycling", label: "Vélo" },
  { value: "swimming", label: "Natation" },
  { value: "elliptical", label: "Elliptique" },
  { value: "stairs", label: "Escaliers" },
  { value: "other", label: "Autre" },
];

const activityLabel = (type: CardioActivityType): string =>
  ACTIVITY_OPTIONS.find((option) => option.value === type)?.label ?? "Cardio";

function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining} s`;
  return remaining === 0 ? `${minutes} min` : `${minutes} min ${remaining} s`;
}

function parsedOptional(raw: string, min: number, max: number): { value: number | null; valid: boolean } {
  if (raw.trim() === "") return { value: null, valid: true };
  const value = Number(raw);
  return { value: Number.isFinite(value) ? value : null, valid: Number.isFinite(value) && value >= min && value <= max };
}

/** Bloc cardio structuré, volontairement séparé du volume et des benchmarks de musculation. */
export function CardioSection({ entries }: { entries: CardioEntry[] }) {
  const addCardioEntry = useWorkoutStore((state) => state.addCardioEntry);
  const deleteCardioEntry = useWorkoutStore((state) => state.deleteCardioEntry);
  const [editing, setEditing] = useState(false);
  const [activityType, setActivityType] = useState<CardioActivityType>("other");
  const [activityName, setActivityName] = useState("Cardio machine");
  const [machineName, setMachineName] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [level, setLevel] = useState("");
  const [resistance, setResistance] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [averageWatts, setAverageWatts] = useState("");
  const [averageHeartRateBpm, setAverageHeartRateBpm] = useState("");
  const [inclinePercent, setInclinePercent] = useState("");

  const ordered = [...entries].sort((a, b) => a.orderIndex - b.orderIndex);
  const durationMinutes = Number(minutes);
  const parsed = {
    level: parsedOptional(level, 0, 100),
    resistance: parsedOptional(resistance, 0, 1000),
    distanceKm: parsedOptional(distanceKm, 0, 1000),
    averageWatts: parsedOptional(averageWatts, 0, 3000),
    averageHeartRateBpm: parsedOptional(averageHeartRateBpm, 20, 260),
    inclinePercent: parsedOptional(inclinePercent, -30, 100),
  };
  const canSave =
    activityName.trim().length > 0 &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0 &&
    durationMinutes <= 1440 &&
    Object.values(parsed).every((field) => field.valid);

  const reset = () => {
    setActivityType("other");
    setActivityName("Cardio machine");
    setMachineName("");
    setMachineModel("");
    setMinutes("10");
    setLevel("");
    setResistance("");
    setDistanceKm("");
    setAverageWatts("");
    setAverageHeartRateBpm("");
    setInclinePercent("");
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
            <p className="text-[0.68rem] text-[--color-fg-faint]">Modalité et métriques machine, sans benchmark implicite</p>
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
                <p className="truncate text-sm font-semibold text-[--color-fg]">
                  {entry.activityName || activityLabel(entry.activityType)}
                </p>
                {(entry.machineName || entry.machineModel) && (
                  <p className="truncate text-[0.68rem] text-[--color-fg-faint]">
                    {[entry.machineName, entry.machineModel].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="text-xs text-[--color-fg-muted]">
                  {durationLabel(entry.durationSeconds)}
                  {entry.distanceKm != null ? ` · ${entry.distanceKm} km` : ""}
                  {entry.level != null ? ` · niveau ${entry.level}` : ""}
                  {entry.resistance != null ? ` · résistance ${entry.resistance}` : ""}
                  {entry.averageWatts != null ? ` · ${entry.averageWatts} W` : ""}
                  {entry.averageHeartRateBpm != null ? ` · ${entry.averageHeartRateBpm} bpm` : ""}
                  {entry.inclinePercent != null ? ` · pente ${entry.inclinePercent}%` : ""}
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
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[0.65rem] font-semibold text-[--color-fg-faint]">
              Modalité
              <select
                value={activityType}
                onChange={(event) => {
                  const next = event.target.value as CardioActivityType;
                  setActivityType(next);
                  setActivityName(activityLabel(next));
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#11131a] px-2 text-sm text-[--color-fg] outline-none"
              >
                {ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <TextField label="Libellé" value={activityName} onChange={setActivityName} placeholder="Cardio machine" />
            <TextField label="Machine" value={machineName} onChange={setMachineName} placeholder="Technogym" />
            <TextField label="Modèle" value={machineModel} onChange={setMachineModel} placeholder="Skillrun" />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <NumericField label="Minutes*" value={minutes} onChange={setMinutes} step="1" min="0.1" max="1440" />
            <NumericField label="Distance km" value={distanceKm} onChange={setDistanceKm} step="0.1" min="0" max="1000" />
            <NumericField label="Niveau" value={level} onChange={setLevel} step="1" min="0" max="100" />
            <NumericField label="Résistance" value={resistance} onChange={setResistance} step="0.5" min="0" max="1000" />
            <NumericField label="Watts moy." value={averageWatts} onChange={setAverageWatts} step="1" min="0" max="3000" />
            <NumericField label="FC moy." value={averageHeartRateBpm} onChange={setAverageHeartRateBpm} step="1" min="20" max="260" />
            <NumericField label="Pente %" value={inclinePercent} onChange={setInclinePercent} step="0.5" min="-30" max="100" />
          </div>

          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              addCardioEntry({
                activityType,
                activityName,
                machineName: machineName.trim() || null,
                machineModel: machineModel.trim() || null,
                durationSeconds: Math.round(durationMinutes * 60),
                level: parsed.level.value,
                resistance: parsed.resistance.value,
                distanceKm: parsed.distanceKm.value,
                averageWatts: parsed.averageWatts.value,
                averageHeartRateBpm: parsed.averageHeartRateBpm.value,
                inclinePercent: parsed.inclinePercent.value,
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

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="min-w-0 text-[0.65rem] font-semibold text-[--color-fg-faint]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 text-sm text-[--color-fg] outline-none focus:border-emerald-300/50"
      />
    </label>
  );
}

function NumericField({ label, value, onChange, step, min, max }: { label: string; value: string; onChange: (value: string) => void; step: string; min: string; max: string }) {
  return (
    <label className="min-w-0 text-[0.65rem] font-semibold text-[--color-fg-faint]">
      <span className="block truncate">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 text-center text-sm text-[--color-fg] outline-none focus:border-emerald-300/50"
      />
    </label>
  );
}
