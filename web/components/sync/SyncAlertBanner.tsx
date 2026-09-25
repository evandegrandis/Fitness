"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CloudOff } from "lucide-react";

import { deadLettersSnapshot, subscribeDeadLetters, type DeadLetter } from "@/lib/sync/outbox";
import { STALE_WRITE_CODE } from "@/lib/sync/outcome";
import { useSyncStatus } from "@/lib/sync/status";

const NO_LETTERS: DeadLetter[] = [];

/** Au-delà, une file encore pleine n'est plus « en cours » : c'est un problème à montrer. */
const STALE_PENDING_MS = 2 * 60_000;

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

/**
 * Bannière globale, visible sur tous les onglets, quand la synchronisation ne
 * se passe pas comme prévu. Deux cas, deux messages :
 * - des écritures REFUSÉES définitivement par le serveur (dead letters) ;
 * - des écritures qui ATTENDENT depuis plus de deux minutes (réseau, serveur).
 *
 * Le 17/09/2026, un mois de séances n'avait atteint le serveur que sur le
 * téléphone, avec pour seul signal un badge « non synchronisé » dans l'en-tête
 * de séance active, invisible le reste du temps. Cette bannière est la réponse :
 * un problème de synchro n'est jamais silencieux.
 */
export function SyncAlertBanner() {
  const pending = useSyncStatus((s) => s.pending);
  const deadLetters = useSyncStatus((s) => s.deadLetters);
  const oldestPendingAt = useSyncStatus((s) => s.oldestPendingAt);
  const lastError = useSyncStatus((s) => s.lastError);
  const letters = useSyncExternalStore(subscribeDeadLetters, deadLettersSnapshot, () => NO_LETTERS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const staleFor = oldestPendingAt !== null ? now - oldestPendingAt : 0;
  const stale = pending > 0 && staleFor > STALE_PENDING_MS;
  if (deadLetters === 0 && !stale) return null;

  // Écritures mises de côté parce que le serveur avait plus récent : rien n'est perdu ni écrasé,
  // ce n'est pas une panne. Le ton et le message le disent.
  const onlyOutdated = deadLetters > 0 && letters.length === deadLetters && letters.every((letter) => letter.error.code === STALE_WRITE_CODE);
  if (onlyOutdated) {
    return (
      <Link
        href="/reglages#synchronisation"
        className="block mx-3 mt-3 rounded-2xl px-4 py-3 text-sm"
        style={{ background: "color-mix(in srgb, var(--color-warning) 14%, transparent)", color: "var(--color-warning)" }}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <CloudOff size={16} />
          {deadLetters > 1 ? `${deadLetters} anciennes écritures mises de côté` : "Une ancienne écriture mise de côté"}
        </span>
        <span className="block mt-0.5 text-xs opacity-80">
          Le serveur avait une version plus récente : rien n&apos;a été écrasé. Ouvre les réglages pour les abandonner.
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/reglages#synchronisation"
      className="block mx-3 mt-3 rounded-2xl px-4 py-3 text-sm"
      style={{
        background: deadLetters > 0 ? "color-mix(in srgb, var(--color-danger) 14%, transparent)" : "color-mix(in srgb, var(--color-warning) 14%, transparent)",
        color: deadLetters > 0 ? "var(--color-danger)" : "var(--color-warning)",
      }}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        {deadLetters > 0 ? <AlertTriangle size={16} /> : <CloudOff size={16} />}
        {deadLetters > 0
          ? `${deadLetters} écriture${deadLetters > 1 ? "s" : ""} refusée${deadLetters > 1 ? "s" : ""} par le serveur`
          : `${pending} écriture${pending > 1 ? "s" : ""} en attente depuis ${formatAge(staleFor)}`}
      </span>
      <span className="block mt-0.5 text-xs opacity-80">
        {deadLetters > 0
          ? "Tes données restent sur ce téléphone. Ouvre les réglages pour voir la raison et décider."
          : lastError
            ? `Dernière erreur : ${lastError.message.slice(0, 120)}`
            : "Le serveur ne confirme pas. Vérifie le réseau ; rien n'est perdu."}
      </span>
    </Link>
  );
}
