"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { importBackup } from "@/lib/db/actions";
import { createBackupJson, parseBackup } from "@/lib/models/backup";
import { sessionsNewestFirst } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { defaultOutboxHandlers } from "@/lib/sync/handlers";
import { flush, pendingCount } from "@/lib/sync/outbox";

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
    const backup = createBackupJson(state);

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
      const parsed = parseBackup(json);
      // Un import remplace toute la base. Rejouer ensuite une ancienne file offline pourrait
      // ressusciter des valeurs antérieures ; on exige donc une file entièrement synchronisée.
      if (pendingCount() > 0 && (await flush(defaultOutboxHandlers)) > 0) {
        throw new Error("Des modifications hors-ligne restent à synchroniser avant l'import.");
      }
      await importBackup(json);
      const active = parsed.sessions.find((session) => session.isActive) ?? null;
      useWorkoutStore.setState({
        catalog: parsed.exercises,
        history: sessionsNewestFirst(parsed.sessions.filter((session) => !session.isActive)),
        goals: parsed.goals,
        settings: parsed.settings,
        templates: parsed.templates,
        recoveryCheckins: parsed.recoveryCheckins,
        active,
        activeMode: parsed.activeMode,
        selectedStartMode: parsed.selectedStartMode,
        pendingVariantSwitches: parsed.pendingVariantSwitches,
        treatedVariantSuggestions: parsed.treatedVariantSuggestions,
        rotationAcceptedAt: parsed.rotationAcceptedAt,
        rest: null,
        undo: null,
        achievement: null,
        armedSupersetExerciseId: null,
        justHitRecord: {},
        recordsCache: {},
      });
      setStatus("Import réussi, rechargement…");
      window.location.reload();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Échec de l'import : ${error.message}`
          : "Échec de l'import : erreur inconnue"
      );
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
