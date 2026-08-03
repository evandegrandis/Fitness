"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { importBackup } from "@/lib/db/actions";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Sauvegarde : export JSON (download Blob, construit côté client depuis le
 * store déjà hydraté) + import (file input -> JSON.parse -> importBackup),
 * avec confirmation avant d'écraser toute la base.
 */
export function SettingsBackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function handleExport() {
    const state = useWorkoutStore.getState();
    const backup = {
      version: 2,
      exportDate: new Date().toISOString(),
      lastWorkoutLoggedAt: state.history[0]?.date.toISOString() ?? null,
      deviceId: "web",
      exercises: state.catalog.map((ex) => ({
        ...ex,
        lastUsed: ex.lastUsed?.toISOString() ?? null,
      })),
      goals: state.goals.map((g) => ({ muscleGroup: g.parent, weeklyGoalSets: g.weeklyGoalSets })),
      settings: state.settings,
      sessions: state.history.map((s) => ({
        id: s.id,
        date: s.date.toISOString(),
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString() ?? null,
        notes: s.notes,
        templateName: s.templateName,
        exercises: s.exercises.map((le) => ({
          id: le.id,
          exerciseId: le.exerciseId,
          exerciseName: le.exerciseName,
          orderIndex: le.orderIndex,
          notes: le.notes,
          sets: le.sets.map((set) => ({
            weight: set.weight,
            reps: set.reps,
            setType: set.setType,
            timestamp: set.timestamp.toISOString(),
            setSlotIndex: set.setSlotIndex,
            completed: set.completed,
            supersetRoundIndex: set.supersetRoundIndex,
          })),
        })),
        supersetGroups: s.supersetGroups.map((g) => ({
          id: g.id,
          orderIndex: g.orderIndex,
          memberIDs: g.memberOrder,
        })),
        cardioEntries: s.cardioEntries ?? [],
      })),
      templates: state.templates.map((t) => ({
        name: t.name,
        sortOrder: t.sortOrder,
        exercises: t.exercises,
      })),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `jeera_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Export téléchargé");
    setTimeout(() => setStatus(null), 2500);
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setConfirmingImport(true);
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setImporting(true);
    try {
      const text = await pendingFile.text();
      const json = JSON.parse(text);
      await importBackup(json);
      setStatus("Import réussi — rechargement…");
      window.location.reload();
    } catch {
      setStatus("Échec de l'import — fichier invalide");
      setImporting(false);
    } finally {
      setConfirmingImport(false);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <GlassCard>
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Sauvegarde</p>
      <div className="mt-3 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleExport}
          className="glass flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[--color-fg] active:scale-[0.98] transition"
        >
          <Download size={16} /> Exporter (JSON)
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="glass flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[--color-fg] active:scale-[0.98] transition disabled:opacity-50"
        >
          <Upload size={16} /> Importer un fichier…
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileSelected} />

        {status && <p className="text-center text-xs text-[--color-fg-muted]">{status}</p>}
      </div>

      {confirmingImport && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="text-xs text-amber-200">
            Importer <strong>{pendingFile?.name}</strong> remplacera TOUTES les données actuelles (séances, exercices,
            objectifs, réglages). Confirmer ?
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmingImport(false);
                setPendingFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="pill flex-1 justify-center bg-white/10"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={importing}
              className="pill flex-1 justify-center border-amber-400/50 bg-amber-400/20 text-amber-100"
            >
              {importing ? "Import…" : "Confirmer l'import"}
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
