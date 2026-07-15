/**
 * Helpers superset purs, miroir des sections superset de
 * `Jeera/ViewModels/WorkoutViewModel.swift` (handleSupersetLink,
 * detachFromSupersetGroup, autoDetectSupersetIfNeeded, detectSupersetMembers,
 * recomputeSupersetRoundIndices, isLastInSuperset / isLinkedToNext).
 *
 * Toutes les fonctions sont pures : elles prennent un `WorkoutSession` et
 * renvoient un nouveau `WorkoutSession` (jamais de mutation en place), pour
 * rester compatible avec les mises à jour immuables de Zustand.
 */

import type { LoggedExercise, LoggedSet, SupersetGroup, WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Requêtes dérivées — miroir de LoggedExercise.isLinkedToNext / isLastInSuperset
// ---------------------------------------------------------------------------

/** Miroir de `LoggedExercise.isLinkedToNext` (Swift) : vrai si un membre suit dans le même groupe. */
export function isLinkedToNext(session: WorkoutSession, loggedExercise: LoggedExercise): boolean {
  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) return false;
  const order = group.memberOrder;
  const idx = order.indexOf(loggedExercise.id);
  return idx >= 0 && idx < order.length - 1;
}

/** Miroir de `LoggedExercise.isLastInSuperset` (Swift). */
export function isLastInSuperset(session: WorkoutSession, loggedExercise: LoggedExercise): boolean {
  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) return false;
  return group.memberOrder[group.memberOrder.length - 1] === loggedExercise.id;
}

// ---------------------------------------------------------------------------
// handleSupersetLink — arm -> arm -> groupe
// ---------------------------------------------------------------------------

export interface SupersetLinkResult {
  session: WorkoutSession;
  /** Nouvelle valeur d'`armedSupersetExerciseId` à stocker dans le store. */
  armed: string | null;
}

/**
 * Miroir de `WorkoutViewModel.handleSupersetLink`.
 * - Exercice déjà groupé -> détache.
 * - Rien d'armé -> arme cet exercice.
 * - Ré-armer le même exercice -> désarme.
 * - Sinon -> lie l'exercice armé et celui-ci dans un groupe (création si besoin),
 *   puis déplace l'exercice qui rejoint juste après la queue du groupe.
 */
export function handleSupersetLink(
  session: WorkoutSession,
  loggedExerciseId: string,
  armedSupersetExerciseId: string | null,
  newGroupId: () => string
): SupersetLinkResult {
  const loggedExercise = session.exercises.find((e) => e.id === loggedExerciseId);
  if (!loggedExercise) return { session, armed: armedSupersetExerciseId };

  if (loggedExercise.supersetGroupId !== null) {
    return { session: detachFromSupersetGroup(session, loggedExerciseId), armed: null };
  }

  if (armedSupersetExerciseId === null) {
    return { session, armed: loggedExerciseId };
  }

  if (armedSupersetExerciseId === loggedExerciseId) {
    return { session, armed: null };
  }

  const armed = session.exercises.find((e) => e.id === armedSupersetExerciseId);
  if (!armed) return { session, armed: null };

  let groups = session.supersetGroups;
  let group: SupersetGroup;
  const existing = groups.find((g) => g.id === armed.supersetGroupId);
  if (existing) {
    group = existing;
  } else {
    group = { id: newGroupId(), orderIndex: armed.orderIndex, memberOrder: [armed.id] };
    groups = [...groups, group];
  }

  const memberOrder = group.memberOrder.includes(loggedExercise.id)
    ? group.memberOrder
    : [...group.memberOrder, loggedExercise.id];
  const updatedGroup: SupersetGroup = { ...group, memberOrder };
  groups = groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));

  let exercises = session.exercises.map((e) => {
    if (e.id === armed.id && !existing) return e; // already in group via updatedGroup lookup below
    if (e.id === loggedExercise.id) return { ...e, supersetGroupId: updatedGroup.id };
    return e;
  });
  // Ensure armed exercise also points at the (possibly new) group.
  exercises = exercises.map((e) => (e.id === armed.id ? { ...e, supersetGroupId: updatedGroup.id } : e));

  // Reorder: move the joining exercise to sit right after the current tail of the group.
  const ordered = [...exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const fromIdx = ordered.findIndex((e) => e.id === loggedExercise.id);
  const armedIdx = ordered.findIndex((e) => e.id === armed.id);
  if (fromIdx === -1 || armedIdx === -1) {
    return { session: { ...session, exercises, supersetGroups: groups }, armed: null };
  }

  let tailIdx = armedIdx;
  while (
    tailIdx < ordered.length - 1 &&
    ordered[tailIdx + 1].supersetGroupId === updatedGroup.id &&
    ordered[tailIdx + 1].id !== loggedExercise.id
  ) {
    tailIdx += 1;
  }

  const mutable = [...ordered];
  const [moving] = mutable.splice(fromIdx, 1);
  const insertAt = tailIdx < fromIdx ? tailIdx + 1 : tailIdx;
  mutable.splice(insertAt, 0, moving);

  const reindexed = mutable.map((e, i) => ({ ...e, orderIndex: i }));

  return {
    session: { ...session, exercises: reindexed, supersetGroups: groups },
    armed: null,
  };
}

/**
 * Miroir de `WorkoutViewModel.detachFromSupersetGroup`. Si le groupe tombe
 * sous 2 membres, il est entièrement supprimé (pas de "superset solo").
 */
export function detachFromSupersetGroup(session: WorkoutSession, loggedExerciseId: string): WorkoutSession {
  const loggedExercise = session.exercises.find((e) => e.id === loggedExerciseId);
  if (!loggedExercise || loggedExercise.supersetGroupId === null) return session;

  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) return session;

  const memberOrder = group.memberOrder.filter((id) => id !== loggedExerciseId);

  if (memberOrder.length < 2) {
    // Unpair everyone and delete the group entirely.
    const memberIds = new Set(group.memberOrder);
    return {
      ...session,
      exercises: session.exercises.map((e) => (memberIds.has(e.id) ? { ...e, supersetGroupId: null } : e)),
      supersetGroups: session.supersetGroups.filter((g) => g.id !== group.id),
    };
  }

  const updatedGroup: SupersetGroup = { ...group, memberOrder };
  return {
    ...session,
    exercises: session.exercises.map((e) => (e.id === loggedExerciseId ? { ...e, supersetGroupId: null } : e)),
    supersetGroups: session.supersetGroups.map((g) => (g.id === group.id ? updatedGroup : g)),
  };
}

/** Miroir de `WorkoutViewModel.toggleSuperset`. */
export function toggleSuperset(
  session: WorkoutSession,
  loggedExerciseId: string,
  armedSupersetExerciseId: string | null,
  newGroupId: () => string
): SupersetLinkResult {
  const loggedExercise = session.exercises.find((e) => e.id === loggedExerciseId);
  if (loggedExercise?.supersetGroupId != null) {
    return { session: detachFromSupersetGroup(session, loggedExerciseId), armed: armedSupersetExerciseId };
  }
  return handleSupersetLink(session, loggedExerciseId, armedSupersetExerciseId, newGroupId);
}

// ---------------------------------------------------------------------------
// Auto-détection — miroir de autoDetectSupersetIfNeeded / detectSupersetMembers
// ---------------------------------------------------------------------------

interface SupersetPoint {
  exerciseId: string;
  timestamp: number;
}

const MAX_GAP_MS = 240_000;

/**
 * Miroir de `WorkoutViewModel.detectSupersetMembers`. Cherche un pattern
 * A→B→(C→D→)A→B... sur les 24 derniers sets complétés (fenêtre de recherche
 * limitée aux 12 derniers points), avec au moins 2 rounds complets et sans
 * gap > 240s entre deux sets consécutifs du pattern détecté.
 */
export function detectSupersetMembers(points: SupersetPoint[]): string[] | null {
  if (points.length < 3) return null;
  const ids = points.map((p) => p.exerciseId);

  for (let size = 4; size >= 2; size--) {
    if (ids.length < size + 1) continue;
    const windowStart = Math.max(0, ids.length - 12);
    for (let start = windowStart; start < ids.length - size; start++) {
      const template = ids.slice(start, start + size);
      if (new Set(template).size !== size) continue;
      if (ids[start + size] !== template[0]) continue;

      let end = start + size;
      while (end + 1 < ids.length) {
        const expected = template[(end + 1 - start) % size];
        if (ids[end + 1] !== expected) break;
        end += 1;
      }

      if (end !== ids.length - 1) continue;
      if (end - start + 1 < size * 2) continue;

      let hasLargeGap = false;
      for (let i = start; i < end; i++) {
        if (points[i + 1].timestamp - points[i].timestamp > MAX_GAP_MS) {
          hasLargeGap = true;
          break;
        }
      }
      if (hasLargeGap) continue;

      return template;
    }
  }

  return null;
}

/**
 * Miroir de `WorkoutViewModel.recomputeSupersetRoundIndices`. Renvoie une
 * nouvelle session avec `supersetRoundIndex` recalculé pour tous les sets
 * work des membres du groupe, dans l'ordre chronologique.
 */
export function recomputeSupersetRoundIndices(session: WorkoutSession, groupId: string): WorkoutSession {
  const group = session.supersetGroups.find((g) => g.id === groupId);
  if (!group) return session;

  const membersById = new Map(session.exercises.map((e) => [e.id, e]));
  const order = group.memberOrder.map((id) => membersById.get(id)).filter((e): e is LoggedExercise => e !== undefined);
  if (order.length === 0) return session;

  const timeline: { exerciseId: string; set: LoggedSet }[] = [];
  for (const ex of order) {
    for (const set of completedWorkSets(ex)) {
      timeline.push({ exerciseId: ex.id, set });
    }
  }
  timeline.sort((a, b) => a.set.timestamp.getTime() - b.set.timestamp.getTime());

  const counters = new Map<string, number>();
  const newRoundBySetId = new Map<string, number>();
  for (const { exerciseId, set } of timeline) {
    const next = (counters.get(exerciseId) ?? 0) + 1;
    counters.set(exerciseId, next);
    newRoundBySetId.set(set.id, next);
  }

  const memberIds = new Set(group.memberOrder);
  return {
    ...session,
    exercises: session.exercises.map((e) => {
      if (!memberIds.has(e.id)) return e;
      return {
        ...e,
        sets: e.sets.map((s) => (newRoundBySetId.has(s.id) ? { ...s, supersetRoundIndex: newRoundBySetId.get(s.id)! } : s)),
      };
    }),
  };
}

/**
 * Miroir de `WorkoutViewModel.autoDetectSupersetIfNeeded`. Appelé après
 * `logSet`. Construit les points depuis tous les sets work complétés de la
 * séance, cherche un pattern, et si trouvé (et incluant l'exercice
 * déclencheur), crée/écrase le groupe correspondant — sauf si les membres
 * appartiennent déjà à un groupe utilisateur distinct du pattern détecté.
 */
export function autoDetectSupersetIfNeeded(
  session: WorkoutSession,
  triggerExerciseId: string,
  newGroupId: () => string
): WorkoutSession {
  const points: SupersetPoint[] = session.exercises
    .flatMap((logged) => completedWorkSets(logged).map((set) => ({ exerciseId: logged.id, timestamp: set.timestamp.getTime() })))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (points.length < 3) return session;
  const recent = points.slice(-24);
  const memberIds = detectSupersetMembers(recent);
  if (!memberIds) return session;
  if (!memberIds.includes(triggerExerciseId)) return session;

  const members = memberIds.map((id) => session.exercises.find((e) => e.id === id)).filter((e): e is LoggedExercise => e !== undefined);
  if (members.length < 2) return session;

  const first = members[0];
  if (first.supersetGroupId !== null) {
    const existing = session.supersetGroups.find((g) => g.id === first.supersetGroupId);
    const allSameGroup = members.every((m) => m.supersetGroupId === first.supersetGroupId);
    if (allSameGroup && existing && arraysEqual(existing.memberOrder, memberIds)) {
      return session; // already grouped identically -> no-op
    }
  }

  const existingGroupIds = new Set(members.map((m) => m.supersetGroupId).filter((id): id is string => id !== null));
  if (existingGroupIds.size > 0) {
    if (existingGroupIds.size !== 1) return session;
    const groupId = [...existingGroupIds][0];
    const onlyGroup = session.supersetGroups.find((g) => g.id === groupId);
    if (onlyGroup && !arraysEqualAsSets(onlyGroup.memberOrder, memberIds)) return session;
  }

  let working = session;
  for (const member of members) {
    if (member.supersetGroupId !== null) {
      working = detachFromSupersetGroup(working, member.id);
    }
  }

  const anchorOrder = Math.min(...members.map((m) => m.orderIndex));
  const newGroup: SupersetGroup = { id: newGroupId(), orderIndex: anchorOrder, memberOrder: memberIds };

  working = {
    ...working,
    exercises: working.exercises.map((e) => (memberIds.includes(e.id) ? { ...e, supersetGroupId: newGroup.id } : e)),
    supersetGroups: [...working.supersetGroups, newGroup],
  };

  return recomputeSupersetRoundIndices(working, newGroup.id);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function arraysEqualAsSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((v) => sa.has(v));
}

// ---------------------------------------------------------------------------
// Reorder après validation — miroir de applyReorderAfterValidate
// ---------------------------------------------------------------------------

/**
 * Miroir de `WorkoutViewModel.applyReorderAfterValidate`. Déplace l'exercice
 * juste après le dernier exercice (autre que lui-même) ayant au moins un set
 * complété — sauf s'il est dans un bloc superset (ne bouge pas le bloc).
 */
export function applyReorderAfterValidate(session: WorkoutSession, loggedExerciseId: string): WorkoutSession {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);

  if (isLinkedToNext(session, ordered.find((e) => e.id === loggedExerciseId)!)) return session;
  const myIdx = ordered.findIndex((e) => e.id === loggedExerciseId);
  if (myIdx === -1) return session;
  if (myIdx > 0 && isLinkedToNext(session, ordered[myIdx - 1])) return session;

  let anchorIdx = -1;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].id !== loggedExerciseId && completedWorkSets(ordered[i]).length > 0) {
      anchorIdx = i;
      break;
    }
  }
  if (anchorIdx === -1) return session;
  if (myIdx <= anchorIdx + 1) return session;

  let insertAfter = anchorIdx;
  while (insertAfter < ordered.length - 1 && isLinkedToNext(session, ordered[insertAfter])) {
    insertAfter += 1;
  }
  if (myIdx === insertAfter + 1) return session;

  const mutable = [...ordered];
  const [moving] = mutable.splice(myIdx, 1);
  const newInsert = insertAfter < myIdx ? insertAfter + 1 : insertAfter;
  mutable.splice(newInsert, 0, moving);

  return { ...session, exercises: mutable.map((e, i) => ({ ...e, orderIndex: i })) };
}

// ---------------------------------------------------------------------------
// moveExercise — détache tous les exercices déplacés puis réindexe
// ---------------------------------------------------------------------------

/** Miroir de `WorkoutViewModel.moveExercise` : détache du superset puis déplace/réindexe. */
export function moveExercise(session: WorkoutSession, fromIndex: number, toIndex: number): WorkoutSession {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  if (fromIndex < 0 || fromIndex >= ordered.length) return session;

  const working = detachFromSupersetGroup(session, ordered[fromIndex].id);
  const reOrdered = [...working.exercises].sort((a, b) => a.orderIndex - b.orderIndex);

  const mutable = [...reOrdered];
  const [moving] = mutable.splice(fromIndex, 1);
  const clampedTo = Math.max(0, Math.min(toIndex, mutable.length));
  mutable.splice(clampedTo, 0, moving);

  return { ...working, exercises: mutable.map((e, i) => ({ ...e, orderIndex: i })) };
}
