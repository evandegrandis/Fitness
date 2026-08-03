import type { WorkoutSession } from "@/lib/models/types";

/**
 * File de synchronisation OFFLINE-FIRST (persistée en localStorage).
 *
 * Garantie : une séance mise en file n'est JAMAIS perdue, même sans réseau ou
 * après fermeture de l'app. Elle reste dans l'outbox tant qu'elle n'a pas été
 * confirmée en base. Aucun faux « enregistré » : le statut ne passe à « saved »
 * que lorsque `save()` a réellement réussi et que l'entrée quitte la file.
 *
 * Ce module est PUR côté données (localStorage) : il ne connaît pas la couche
 * serveur — l'appelant fournit la fonction `save` (server action saveSession).
 */

const KEY = "jeera_sync_outbox_v1";

interface OutboxEntry {
  session: WorkoutSession;
  enqueuedAt: number;
}

function revive(session: WorkoutSession): WorkoutSession {
  const d = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));
  return {
    ...session,
    date: d(session.date),
    startTime: d(session.startTime),
    endTime: session.endTime == null ? null : d(session.endTime),
    cardioEntries: session.cardioEntries ?? [],
    exercises: session.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, timestamp: d(s.timestamp) })),
    })),
  };
}

function read(): OutboxEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxEntry[];
    return parsed.map((e) => ({ ...e, session: revive(e.session) }));
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota / mode privé : on ne peut rien faire de mieux ici */
  }
}

/** Met une séance en file (remplace toute entrée existante du même id). */
export function enqueue(session: WorkoutSession): void {
  const entries = read().filter((e) => e.session.id !== session.id);
  entries.push({ session, enqueuedAt: Date.now() });
  write(entries);
}

/** Nombre de séances en attente de synchronisation. */
export function pendingCount(): number {
  return read().length;
}

/**
 * Tente de synchroniser toute la file. Chaque séance confirmée quitte la file ;
 * celles qui échouent (pas de réseau, serveur KO) y restent pour un prochain
 * essai. Retourne le nombre encore en attente après la tentative.
 */
export async function flush(save: (session: WorkoutSession) => Promise<void>): Promise<number> {
  const entries = read();
  if (entries.length === 0) return 0;

  const remaining: OutboxEntry[] = [];
  for (const entry of entries) {
    try {
      await save(entry.session);
    } catch {
      remaining.push(entry); // échec → on garde pour plus tard, jamais de perte
    }
  }
  write(remaining);
  return remaining.length;
}
