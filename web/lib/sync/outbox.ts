import type {
  BodyWeightEntry,
  Exercise,
  MuscleGoal,
  RecoveryCheckinInput,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";

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
  return { ...exercise, lastUsed: exercise.lastUsed == null ? null : toDate(exercise.lastUsed) };
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
export function enqueue(op: OutboxOp): void {
  const key = dedupeKeyOf(op);
  const entries = read();
  const existingIndex = entries.findIndex((entry) => entry.dedupeKey === key);
  const entryId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const replacement: OutboxEntry = { dedupeKey: key, entryId, op, enqueuedAt: Date.now() };
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

/** Une fonction de sauvegarde par kind d'opération — fournies par l'appelant (server actions). */
export interface OutboxHandlers {
  session: (session: WorkoutSession) => Promise<void>;
  sessionDelete: (sessionId: string) => Promise<void>;
  settings: (settings: UserSettings) => Promise<void>;
  goals: (goals: MuscleGoal[]) => Promise<void>;
  recoveryCheckin: (checkin: RecoveryCheckinInput) => Promise<void>;
  exerciseUpsert: (exercise: Exercise) => Promise<void>;
  exerciseDelete: (exerciseId: string) => Promise<void>;
  templateUpsert: (template: WorkoutTemplate) => Promise<void>;
  templateDelete: (templateId: string) => Promise<void>;
  bodyWeight: (entry: BodyWeightEntry) => Promise<void>;
}

async function applyOp(op: OutboxOp, handlers: OutboxHandlers): Promise<void> {
  switch (op.kind) {
    case "session":
      return handlers.session(op.session);
    case "session_delete":
      return handlers.sessionDelete(op.sessionId);
    case "settings":
      return handlers.settings(op.settings);
    case "goals":
      return handlers.goals(op.goals);
    case "recovery_checkin":
      return handlers.recoveryCheckin(op.checkin);
    case "exercise_upsert":
      return handlers.exerciseUpsert(op.exercise);
    case "exercise_delete":
      return handlers.exerciseDelete(op.exerciseId);
    case "template_upsert":
      return handlers.templateUpsert(op.template);
    case "template_delete":
      return handlers.templateDelete(op.templateId);
    case "body_weight":
      return handlers.bodyWeight(op.entry);
  }
}

/**
 * Tente de synchroniser toute la file, DANS L'ORDRE d'insertion (une suppression mise en file
 * après une modification doit se rejouer après, jamais avant — voir la doc de `dedupeKey`
 * ci-dessus). Chaque opération confirmée quitte la file ; celles qui échouent (pas de réseau,
 * serveur KO) y restent pour un prochain essai. Retourne le nombre encore en attente après la
 * tentative.
 */
async function flushOnce(handlers: OutboxHandlers): Promise<number> {
  const entries = read();
  if (entries.length === 0) return 0;

  const tokenOf = (entry: OutboxEntry) =>
    entry.entryId ?? `${entry.dedupeKey}:${entry.enqueuedAt}`; // compat file v1 existant
  const confirmed = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      await applyOp(entry.op, handlers);
      confirmed.add(tokenOf(entry));
    } catch {
      // L'ordre est causal : si A échoue, B ne doit pas passer devant (upsert A puis delete B de
      // la même entité, ou session active puis session finie). On conserve donc A ET toute la
      // suffixe sans tenter les opérations suivantes.
      break;
    }
  }
  // Relit au dernier moment : une action utilisateur peut avoir été enqueue pendant les awaits
  // réseau ci-dessus. On ne retire que l'INSTANCE exacte confirmée (clé + timestamp), jamais une
  // nouvelle valeur qui aurait remplacé la même cible entre-temps.
  const current = read();
  const remaining = current.filter((entry) => !confirmed.has(tokenOf(entry)));
  // Si cette écriture échoue, on remonte l'erreur : l'appelant ne doit surtout pas afficher
  // « enregistré ». Les sauvegardes serveur restent idempotentes.
  write(remaining);
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
