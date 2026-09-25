"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { RefreshCw, Trash2 } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { defaultOutboxHandlers } from "@/lib/sync/handlers";
import { deadLettersSnapshot, discardDeadLetter, discardStaleDeadLetters, flush, retryDeadLetter, snapshot, subscribeDeadLetters, type DeadLetter } from "@/lib/sync/outbox";
import { STALE_WRITE_CODE } from "@/lib/sync/outcome";

const EMPTY: DeadLetter[] = [];
import { useSyncStatus } from "@/lib/sync/status";

function describeOp(letter: DeadLetter): string {
  const op = letter.op;
  switch (op.kind) {
    case "session":
      return `Séance du ${op.session.startTime.toLocaleDateString("fr-FR")} (${op.session.exercises.length} exercices)`;
    case "session_delete":
      return `Suppression de séance ${op.sessionId.slice(0, 8)}`;
    case "settings":
      return "Réglages";
    case "goals":
      return "Objectifs musculaires";
    case "recovery_checkin":
      return `Check-in du ${op.checkin.date.toLocaleDateString("fr-FR")}`;
    case "exercise_upsert":
      return `Exercice « ${op.exercise.name} »`;
    case "exercise_delete":
      return `Suppression d'exercice ${op.exerciseId.slice(0, 8)}`;
    case "template_upsert":
      return `Modèle « ${op.template.name} »`;
    case "template_delete":
      return `Suppression de modèle ${op.templateId.slice(0, 8)}`;
    case "body_weight":
      return `Pesée du ${op.entry.measuredOn.toLocaleDateString("fr-FR")} (${op.entry.weightKg} kg)`;
  }
}

/**
 * Réglages → Synchronisation. Montre ce que le téléphone n'a pas encore pu
 * écrire sur le serveur, et les écritures refusées définitivement avec leur
 * raison exacte. Rejouer ou abandonner est une décision explicite d'Evan :
 * l'app ne jette jamais une donnée toute seule.
 */
export function SettingsSyncSection() {
  const pending = useSyncStatus((s) => s.pending);
  const lastError = useSyncStatus((s) => s.lastError);
  const setSnapshot = useSyncStatus((s) => s.setSnapshot);
  const setPending = useSyncStatus((s) => s.setPending);
  // Source externe (localStorage) lue via useSyncExternalStore : rendu serveur
  // vide, rendu client à jour, sans setState dans un effet.
  const letters = useSyncExternalStore(subscribeDeadLetters, deadLettersSnapshot, () => EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setSnapshot(snapshot());
    } catch {
      setMessage("La file locale est illisible.");
    }
  }, [setSnapshot]);

  async function forceSync() {
    setBusy(true);
    try {
      const remaining = await flush(defaultOutboxHandlers);
      setPending(remaining);
      setMessage(remaining === 0 ? "Tout est synchronisé." : `${remaining} écriture${remaining > 1 ? "s" : ""} encore en attente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      refresh();
      setBusy(false);
    }
  }

  function retry(entryId: string) {
    retryDeadLetter(entryId);
    refresh();
    void forceSync();
  }

  const staleCount = letters.filter((letter) => letter.error.code === STALE_WRITE_CODE).length;

  function discardStale() {
    if (!window.confirm(`Abandonner ${staleCount > 1 ? `ces ${staleCount} anciennes écritures` : "cette ancienne écriture"} ? Le serveur garde ses versions actuelles.`)) return;
    discardStaleDeadLetters();
    refresh();
  }

  function discard(entryId: string) {
    if (!window.confirm("Abandonner cette écriture ? Elle ne sera jamais envoyée au serveur.")) return;
    discardDeadLetter(entryId);
    refresh();
  }

  return (
    <GlassCard id="synchronisation" className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Synchronisation</h2>
        <button
          type="button"
          onClick={() => void forceSync()}
          disabled={busy}
          className="inline-flex items-center gap-1 text-sm text-(--accent) disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Synchroniser
        </button>
      </div>
      <p className="text-sm text-(--color-fg-faint)">
        {pending === 0 ? "Aucune écriture en attente." : `${pending} écriture${pending > 1 ? "s" : ""} en attente d'envoi.`}
        {lastError ? ` Dernière erreur : ${lastError.message.slice(0, 160)}` : ""}
      </p>
      {staleCount > 0 && (
        <div className="rounded-xl p-3 text-sm space-y-2" style={{ background: "color-mix(in srgb, var(--color-warning) 12%, transparent)" }}>
          <p>
            {staleCount > 1 ? `${staleCount} anciennes écritures mises de côté` : "Une ancienne écriture mise de côté"} : le serveur avait une version plus récente, rien n&apos;a été écrasé.
          </p>
          <button type="button" onClick={discardStale} className="inline-flex items-center gap-1 text-xs text-(--color-danger)">
            <Trash2 size={12} /> Tout abandonner
          </button>
        </div>
      )}
      {letters.length > 0 && (
        <ul className="space-y-2">
          {letters.map((letter) => (
            <li
              key={letter.entryId}
              className="rounded-xl p-3 text-sm"
              style={{ background: `color-mix(in srgb, var(${letter.error.code === STALE_WRITE_CODE ? "--color-warning" : "--color-danger"}) 10%, transparent)` }}
            >
              <div className="font-medium">{describeOp(letter)}</div>
              <div className="text-xs text-(--color-fg-faint) mt-0.5">
                {letter.error.code === STALE_WRITE_CODE ? "Mise de côté" : "Refusée"} le {new Date(letter.failedAt).toLocaleString("fr-FR")}{letter.error.code ? ` · code ${letter.error.code}` : ""}
              </div>
              <div className="text-xs mt-1 break-words">{letter.error.message}</div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => retry(letter.entryId)} className="inline-flex items-center gap-1 text-xs text-(--accent)">
                  <RefreshCw size={12} /> Réessayer
                </button>
                <button type="button" onClick={() => discard(letter.entryId)} className="inline-flex items-center gap-1 text-xs text-(--color-danger)">
                  <Trash2 size={12} /> Abandonner
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-xs text-(--color-fg-faint)">{message}</p>}
    </GlassCard>
  );
}
