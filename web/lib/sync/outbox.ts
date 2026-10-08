import type {
  BodyWeightEntry,
  Exercise,
  MuscleGoal,
  RecoveryCheckinInput,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";
import { withKnownMuscleProfile } from "@/lib/data/catalog-muscle-profiles";
import { isSyncFailure, STALE_WRITE_CODE, type SyncFailure, type SyncOutcome } from "@/lib/sync/outcome";

/**
 * File de synchronisation OFFLINE-FIRST (persistée en localStorage).
 *
 * Une mise en file n'est considérée réussie qu'après écriture ET relecture du
 * localStorage. Les erreurs quota, mode privé ou JSON corrompu sont remontées à
 * l'appelant; elles ne sont jamais transformées en faux succès.
 *
 * Ce module est PUR côté données (localStorage) : il ne connaît pas la couche
 * serveur — l'appelant fournit les fonctions de sauvegarde (server actions),
 * via `OutboxHandlers` pour `flush()`.
 *
 * OFFLINE_PWA_SPEC §4 (P4.4) — au départ dédiée aux séances terminées
 * (`saveSession`), cette file est désormais un OUTBOX GÉNÉRIQUE : `OutboxOp`
 * couvre aussi les écritures de réglages/catalogue (`updateSettings`,
 * `upsertExercise`, `deleteExercise`) qui, avant ce lot, étaient appelées
 * directement depuis les composants sans aucun filet hors-ligne (perte totale
 * de l'action si le réseau était coupé). Un seul mécanisme, pas un deuxième
 * outbox parallèle.
 */

const KEY = "jeera_sync_outbox_v1";
const DEAD_LETTER_KEY = "jeera_sync_deadletter_v1";

/** Une opération d'écriture différée en attente de resync vers Neon. */
export type OutboxOp =
  | { kind: "session"; session: WorkoutSession }
  | { kind: "session_delete"; sessionId: string }
  | { kind: "settings"; settings: UserSettings }
  | { kind: "goals"; goals: MuscleGoal[] }
  | { kind: "recovery_checkin"; checkin: RecoveryCheckinInput }
  | { kind: "exercise_upsert"; exercise: Exercise }
  | { kind: "exercise_delete"; exerciseId: string }
  | { kind: "template_upsert"; template: WorkoutTemplate }
  | { kind: "template_delete"; templateId: string }
  | { kind: "body_weight"; entry: BodyWeightEntry };

interface OutboxEntry {
  /**
   * Clé de dédoublonnage (kind+cible) : une nouvelle écriture visant la MÊME cible remplace
   * l'entrée en attente plutôt que d'empiler des états intermédiaires que Neon ne verra jamais de
   * toute façon (seul le dernier état compte pour un upsert/singleton). Les opérations de KIND ou de
   * CIBLE différents ne se dédoublonnent jamais entre elles. Un upsert et un delete de la même
   * entité partagent volontairement la même clé : seule l'intention la plus récente est conservée,
   * ce qui empêche une ancienne écriture de ressusciter une donnée supprimée.
   */
  dedupeKey: string;
  /** Identité de cette version précise, distincte même pour deux taps dans la même milliseconde. */
  entryId?: string;
  op: OutboxOp;
  enqueuedAt: number;
  /**
   * Heure où l'écriture a été décidée sur cet appareil, envoyée au serveur avec elle : si la cible
   * a changé sur le serveur après cette heure, l'écriture est mise de côté au lieu d'écraser
   * (`lib/db/sync-actions.ts`). Absente = `enqueuedAt`. Une séance récupérée depuis l'historique
   * local porte l'heure de sa fin, pas celle de la récupération.
   */
  intentAt?: number;
  /** Tentatives de rejeu déjà effectuées (transitoires comprises). */
  attempts?: number;
  /** Dernier rejet, pour l'affichage : jamais une raison d'abandonner seul. */
  lastError?: { kind: SyncFailure["kind"]; code: string | null; message: string; at: number };
}

/**
 * Opération que le serveur a refusée de façon PERMANENTE (contrainte, donnée
 * invalide). Elle quitte la file pour ne plus bloquer ce qui suit, mais elle
 * n'est jamais effacée en silence : elle reste lisible, rejouable ou
 * abandonnable explicitement depuis les réglages.
 */
export interface DeadLetter {
  entryId: string;
  dedupeKey: string;
  op: OutboxOp;
  enqueuedAt: number;
  failedAt: number;
  attempts: number;
  error: { code: string | null; message: string };
}

/** Résumé exposé au reste de l'app après chaque flush. */
export interface OutboxSnapshot {
  pending: number;
  deadLetters: number;
  oldestPendingAt: number | null;
  lastError: OutboxEntry["lastError"] | null;
}

export class OutboxPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OutboxPersistenceError";
  }
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

function reviveSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    date: toDate(session.date),
    startTime: toDate(session.startTime),
    endTime: session.endTime == null ? null : toDate(session.endTime),
    // `undefined` signifie « ne pas écraser les entrées serveur » dans saveSession.
    // Un ancien item d'outbox ne doit donc jamais devenir artificiellement `[]` au reload.
    cardioEntries: session.cardioEntries,
    exercises: session.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({
        ...s,
        timestamp: toDate(s.timestamp),
        suggestedWeight: s.suggestedWeight ?? null,
        suggestedReps: s.suggestedReps ?? null,
        predictedRepsAtActualWeight: s.predictedRepsAtActualWeight ?? null,
        suggestedSetType: s.suggestedSetType ?? null,
        suggestionMode: s.suggestionMode ?? null,
        suggestionReasonCodes: Array.isArray(s.suggestionReasonCodes)
          ? s.suggestionReasonCodes.filter((code): code is string => typeof code === "string")
          : [],
        suggestionEngineVersion: s.suggestionEngineVersion ?? null,
        logicalSetId: s.logicalSetId ?? null,
        setTechnique: s.setTechnique ?? null,
      })),
    })),
  };
}

/** `Exercise.lastUsed` est le seul champ Date d'un `Exercise` — revivifié après un JSON round-trip. */
function reviveExercise(exercise: Exercise): Exercise {
  return withKnownMuscleProfile({
    ...exercise,
    lastUsed: exercise.lastUsed == null ? null : toDate(exercise.lastUsed),
  });
}

function reviveTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return { ...template, createdAt: toDate(template.createdAt) };
}

function reviveOp(op: OutboxOp): OutboxOp {
  switch (op.kind) {
    case "session":
      return { kind: "session", session: reviveSession(op.session) };
    case "exercise_upsert":
      return { kind: "exercise_upsert", exercise: reviveExercise(op.exercise) };
    case "recovery_checkin":
      return { kind: "recovery_checkin", checkin: { ...op.checkin, date: toDate(op.checkin.date) } };
    case "template_upsert":
      return { kind: "template_upsert", template: reviveTemplate(op.template) };
    case "body_weight":
      return { kind: "body_weight", entry: { ...op.entry, measuredOn: toDate(op.entry.measuredOn) } };
    case "settings":
    case "goals":
    case "exercise_delete":
    case "session_delete":
    case "template_delete":
      return op; // aucun champ Date à revivre
  }
}

function dedupeKeyOf(op: OutboxOp): string {
  switch (op.kind) {
    case "session":
      return `session:${op.session.id}`;
    case "session_delete":
      return `session:${op.sessionId}`;
    case "settings":
      return "settings"; // singleton : seule la dernière valeur en attente compte
    case "goals":
      return "goals"; // la liste complète remplace l'état précédent
    case "recovery_checkin":
      return `recovery:${op.checkin.date.toISOString()}`;
    case "exercise_upsert":
      return `exercise:${op.exercise.id}`;
    case "exercise_delete":
      return `exercise:${op.exerciseId}`;
    case "template_upsert":
      return `template:${op.template.id}`;
    case "template_delete":
      return `template:${op.templateId}`;
    case "body_weight":
      // Clé par JOUR : repeser deux fois le même jour hors-ligne ne doit pousser qu'une écriture.
      return `body_weight:${new Date(op.entry.measuredOn).toISOString().slice(0, 10)}`;
  }
}

function read(): OutboxEntry[] {
  if (typeof window === "undefined") {
    throw new OutboxPersistenceError("La file offline n'est disponible que dans le navigateur.");
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxEntry[];
    return parsed.map((e) => ({ ...e, op: reviveOp(e.op) }));
  } catch (error) {
    throw new OutboxPersistenceError("La file offline locale est illisible; aucune entrée n'a été supprimée.", {
      cause: error,
    });
  }
}

function write(entries: OutboxEntry[]): void {
  if (typeof window === "undefined") {
    throw new OutboxPersistenceError("La file offline n'est disponible que dans le navigateur.");
  }
  try {
    const serialized = JSON.stringify(entries);
    window.localStorage.setItem(KEY, serialized);
    if (window.localStorage.getItem(KEY) !== serialized) {
      throw new Error("La vérification après écriture a échoué.");
    }
  } catch (error) {
    throw new OutboxPersistenceError("Impossible de sécuriser l'action dans la file offline locale.", {
      cause: error,
    });
  }
}

/** Met une opération en file (remplace toute entrée en attente visant la même cible). */
export function enqueue(op: OutboxOp, options: { intentAt?: number } = {}): void {
  const key = dedupeKeyOf(op);
  const entries = read();
  const existingIndex = entries.findIndex((entry) => entry.dedupeKey === key);
  const entryId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const replacement: OutboxEntry = {
    dedupeKey: key,
    entryId,
    op,
    enqueuedAt: Date.now(),
    ...(options.intentAt !== undefined ? { intentAt: options.intentAt } : {}),
  };
  if (existingIndex >= 0) {
    // Conserve la position causale initiale. Exemple : créer E hors-ligne,
    // enregistrer une séance qui référence E, puis rééditer E doit rester
    // [upsert E (dernier état), session], jamais [session, upsert E].
    entries[existingIndex] = replacement;
  } else {
    entries.push(replacement);
  }
  write(entries);
}

/**
 * Une écriture directe confirmée rend obsolète toute ancienne opération locale visant la même
 * cible. Sans cet acquittement, un ancien upsert pourrait être rejoué après un delete plus récent
 * et ressusciter la donnée.
 */
export function acknowledgeDirectSuccess(op: OutboxOp): void {
  const key = dedupeKeyOf(op);
  const entries = read();
  if (!entries.some((entry) => entry.dedupeKey === key)) return;
  write(entries.filter((entry) => entry.dedupeKey !== key));
}

/** Nombre d'opérations en attente de synchronisation. */
export function pendingCount(): number {
  return read().length;
}

/**
 * Une fonction de sauvegarde par kind d'opération, fournie par l'appelant. Chacune reçoit aussi
 * `intentAt`, l'heure où l'écriture a été décidée sur l'appareil (voir `OutboxEntry.intentAt`).
 * Un handler renvoie soit rien (succès), soit un `SyncOutcome`. Une exception
 * levée est traitée comme un échec TRANSITOIRE (réseau, serveur muet) : seul
 * un résultat `{ ok: false, kind: "permanent" }` explicite peut sortir une
 * opération de la file.
 */
type HandlerResult = Promise<SyncOutcome | void>;

export interface OutboxHandlers {
  session: (session: WorkoutSession, intentAt: number) => HandlerResult;
  sessionDelete: (sessionId: string, intentAt: number) => HandlerResult;
  settings: (settings: UserSettings, intentAt: number) => HandlerResult;
  goals: (goals: MuscleGoal[], intentAt: number) => HandlerResult;
  recoveryCheckin: (checkin: RecoveryCheckinInput, intentAt: number) => HandlerResult;
  exerciseUpsert: (exercise: Exercise, intentAt: number) => HandlerResult;
  exerciseDelete: (exerciseId: string, intentAt: number) => HandlerResult;
  templateUpsert: (template: WorkoutTemplate, intentAt: number) => HandlerResult;
  templateDelete: (templateId: string, intentAt: number) => HandlerResult;
  bodyWeight: (entry: BodyWeightEntry, intentAt: number) => HandlerResult;
}

async function applyOp(op: OutboxOp, handlers: OutboxHandlers, intentAt: number): HandlerResult {
  switch (op.kind) {
    case "session":
      return handlers.session(op.session, intentAt);
    case "session_delete":
      return handlers.sessionDelete(op.sessionId, intentAt);
    case "settings":
      return handlers.settings(op.settings, intentAt);
    case "goals":
      return handlers.goals(op.goals, intentAt);
    case "recovery_checkin":
      return handlers.recoveryCheckin(op.checkin, intentAt);
    case "exercise_upsert":
      return handlers.exerciseUpsert(op.exercise, intentAt);
    case "exercise_delete":
      return handlers.exerciseDelete(op.exerciseId, intentAt);
    case "template_upsert":
      return handlers.templateUpsert(op.template, intentAt);
    case "template_delete":
      return handlers.templateDelete(op.templateId, intentAt);
    case "body_weight":
      return handlers.bodyWeight(op.entry, intentAt);
  }
}

function readDeadLetters(): DeadLetter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEAD_LETTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeadLetter[];
    return parsed.map((letter) => ({ ...letter, op: reviveOp(letter.op) }));
  } catch {
    return [];
  }
}

const DEAD_LETTERS_CHANGED_EVENT = "jeera:dead-letters-changed";

function writeDeadLetters(letters: DeadLetter[]): void {
  window.localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(letters));
  window.dispatchEvent(new Event(DEAD_LETTERS_CHANGED_EVENT));
}

/** Opérations refusées définitivement, les plus récentes d'abord. */
export function deadLetters(): DeadLetter[] {
  return [...readDeadLetters()].sort((a, b) => b.failedAt - a.failedAt);
}

let deadLettersCache: { raw: string | null; value: DeadLetter[] } = { raw: null, value: [] };
const EMPTY_DEAD_LETTERS: DeadLetter[] = [];

/** Lecture stable pour `useSyncExternalStore` : même référence tant que le stockage n'a pas changé. */
export function deadLettersSnapshot(): DeadLetter[] {
  if (typeof window === "undefined") return EMPTY_DEAD_LETTERS;
  const raw = window.localStorage.getItem(DEAD_LETTER_KEY);
  if (raw === deadLettersCache.raw) return deadLettersCache.value;
  deadLettersCache = { raw, value: deadLetters() };
  return deadLettersCache.value;
}

export function subscribeDeadLetters(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DEAD_LETTERS_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(DEAD_LETTERS_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Remet une opération refusée en fin de file (après correction côté serveur, par exemple). */
export function retryDeadLetter(entryId: string): boolean {
  const letters = readDeadLetters();
  const letter = letters.find((item) => item.entryId === entryId);
  if (!letter) return false;
  enqueue(letter.op);
  writeDeadLetters(letters.filter((item) => item.entryId !== entryId));
  return true;
}

/** Abandon EXPLICITE d'une opération refusée : seul l'utilisateur peut le décider. */
export function discardDeadLetter(entryId: string): boolean {
  const letters = readDeadLetters();
  if (!letters.some((item) => item.entryId === entryId)) return false;
  writeDeadLetters(letters.filter((item) => item.entryId !== entryId));
  return true;
}

/**
 * Abandon EXPLICITE, en une fois, des écritures mises de côté parce que le serveur avait une
 * version plus récente (`stale_write`). Les vrais refus restent, un par un.
 */
export function discardStaleDeadLetters(): number {
  const letters = readDeadLetters();
  const kept = letters.filter((letter) => letter.error.code !== STALE_WRITE_CODE);
  if (kept.length === letters.length) return 0;
  writeDeadLetters(kept);
  return letters.length - kept.length;
}

function tokenOf(entry: OutboxEntry): string {
  return entry.entryId ?? `${entry.dedupeKey}:${entry.enqueuedAt}`; // compat file v1 existant
}

/** État courant de la file, sans tentative réseau. */
export function snapshot(): OutboxSnapshot {
  const entries = read();
  const withError = entries.filter((entry) => entry.lastError).sort((a, b) => (b.lastError!.at - a.lastError!.at));
  return {
    pending: entries.length,
    deadLetters: readDeadLetters().length,
    oldestPendingAt: entries.length ? Math.min(...entries.map((entry) => entry.enqueuedAt)) : null,
    lastError: withError[0]?.lastError ?? null,
  };
}

/**
 * Tente de synchroniser toute la file, DANS L'ORDRE d'insertion (une suppression mise en file
 * après une modification doit se rejouer après, jamais avant — voir la doc de `dedupeKey`
 * ci-dessus).
 *
 * Trois issues par opération :
 * - confirmée → elle quitte la file ;
 * - refus PERMANENT (résultat explicite du serveur) → elle devient une dead letter visible et la
 *   file CONTINUE : une écriture impossible ne peut plus geler toutes les suivantes en silence.
 *   Si une suivante dépendait d'elle, elle sera refusée à son tour, donc visible elle aussi ;
 * - échec TRANSITOIRE (exception réseau, serveur indisponible) → on s'arrête là et on garde
 *   l'ordre causal pour le prochain essai, en notant la tentative et l'erreur.
 *
 * Retourne le nombre encore en attente après la tentative.
 */
/**
 * Délai d'une opération de rejeu. Un réseau capté mais muet (salle en 3G, 08/10/2026) laisse une
 * requête pendante plus d'une minute : sans borne, `flush` restait « en cours » et plus rien ne se
 * synchronisait jusqu'à la fermeture de l'app. Au-delà, l'essai compte comme un échec transitoire
 * (l'opération reste en tête de file, rejouée plus tard ; les écritures serveur sont idempotentes
 * et la garde `stale_write` protège d'une réponse tardive).
 */
export const OP_TIMEOUT_MS = 45_000;

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Délai dépassé : réseau trop lent, nouvel essai plus tard.")), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

async function flushOnce(handlers: OutboxHandlers): Promise<number> {
  const entries = read();
  if (entries.length === 0) return 0;

  const confirmed = new Set<string>();
  const failedPermanently = new Map<string, SyncFailure>();
  let transientFailure: { token: string; failure: SyncFailure } | null = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    let outcome: SyncOutcome;
    try {
      const result = await withTimeout(applyOp(entry.op, handlers, entry.intentAt ?? entry.enqueuedAt), OP_TIMEOUT_MS);
      outcome = isSyncFailure(result) ? result : { ok: true };
    } catch (error) {
      outcome = { ok: false, kind: "transient", code: null, message: error instanceof Error ? error.message : String(error) };
    }
    if (outcome.ok) {
      confirmed.add(tokenOf(entry));
      continue;
    }
    if (outcome.kind === "permanent") {
      failedPermanently.set(tokenOf(entry), outcome);
      continue;
    }
    transientFailure = { token: tokenOf(entry), failure: outcome };
    break;
  }
  // Relit au dernier moment : une action utilisateur peut avoir été enqueue pendant les awaits
  // réseau ci-dessus. On ne retire que l'INSTANCE exacte confirmée (clé + timestamp), jamais une
  // nouvelle valeur qui aurait remplacé la même cible entre-temps.
  const current = read();
  const now = Date.now();
  const letters = readDeadLetters();
  const remaining: OutboxEntry[] = [];
  for (const entry of current) {
    const token = tokenOf(entry);
    if (confirmed.has(token)) continue;
    const permanent = failedPermanently.get(token);
    if (permanent) {
      letters.push({
        entryId: token,
        dedupeKey: entry.dedupeKey,
        op: entry.op,
        enqueuedAt: entry.enqueuedAt,
        failedAt: now,
        attempts: (entry.attempts ?? 0) + 1,
        error: { code: permanent.code, message: permanent.message },
      });
      continue;
    }
    if (transientFailure && transientFailure.token === token) {
      remaining.push({
        ...entry,
        attempts: (entry.attempts ?? 0) + 1,
        lastError: { kind: "transient", code: transientFailure.failure.code, message: transientFailure.failure.message, at: now },
      });
      continue;
    }
    remaining.push(entry);
  }
  // Si cette écriture échoue, on remonte l'erreur : l'appelant ne doit surtout pas afficher
  // « enregistré ». Les sauvegardes serveur restent idempotentes.
  write(remaining);
  if (failedPermanently.size > 0) writeDeadLetters(letters);
  return remaining.length;
}

let flushInFlight: Promise<number> | null = null;

/** Un seul rejeu à la fois, même si montage, événement `online` et intervalle se chevauchent. */
export function flush(handlers: OutboxHandlers): Promise<number> {
  if (flushInFlight) return flushInFlight;
  const task = flushOnce(handlers).finally(() => {
    if (flushInFlight === task) flushInFlight = null;
  });
  flushInFlight = task;
  return task;
}
