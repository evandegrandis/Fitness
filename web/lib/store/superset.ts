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
import { immediateCompositeKind } from "@/lib/engines/set-structure";

const MAX_SUPERSET_MEMBERS = 4;

interface SupersetVisit {
  exerciseId: string;
  sets: LoggedSet[];
  timestamp: number;
}

/**
 * Une visite correspond à une série normale, ou à un bloc composite immédiat
 * (drop-set / rest-pause). Les continuations d'un composite appartiennent à la
 * même visite et, par conséquent, au même round de superset.
 *
 * Cette lecture ignore volontairement les `supersetRoundIndex` existants : elle
 * sert aussi à réparer les anciennes séances où les deux moitiés d'un drop-set
 * avaient reçu des rounds différents.
 */
function completedWorkVisits(session: WorkoutSession, exercise: LoggedExercise): SupersetVisit[] {
  const visits: SupersetVisit[] = [];

  for (const set of completedWorkSets(exercise)) {
    const previousVisit = visits.at(-1);
    const previousSet = previousVisit?.sets.at(-1);
    const hasInterveningExercise =
      previousSet !== undefined &&
      session.exercises.some(
        (candidate) =>
          candidate.id !== exercise.id &&
          completedWorkSets(candidate).some(
            (candidateSet) =>
              candidateSet.timestamp.getTime() > previousSet.timestamp.getTime() &&
              candidateSet.timestamp.getTime() < set.timestamp.getTime()
          )
      );
    const continuesVisit =
      previousSet !== undefined &&
      !hasInterveningExercise &&
      immediateCompositeKind(previousSet, set, {}) !== null;

    if (previousVisit && continuesVisit) {
      previousVisit.sets.push(set);
      previousVisit.timestamp = set.timestamp.getTime();
      continue;
    }

    visits.push({ exerciseId: exercise.id, sets: [set], timestamp: set.timestamp.getTime() });
  }

  return visits;
}

function groupForExercise(session: WorkoutSession, loggedExerciseId: string): SupersetGroup | undefined {
  const logged = session.exercises.find((exercise) => exercise.id === loggedExerciseId);
  return session.supersetGroups.find((group) => group.id === logged?.supersetGroupId);
}

function clearSupersetRounds(exercise: LoggedExercise): LoggedExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((set) =>
      set.supersetRoundIndex === null ? set : { ...set, supersetRoundIndex: null }
    ),
  };
}

/**
 * Recopie uniquement la topologie superset d'une séance vers une nouvelle
 * séance vide (cas « Reprendre »). Les occurrences du même exercice catalogue
 * sont appariées dans leur ordre, sans recopier les sets ni les anciens UUID.
 */
export function cloneSupersetTopology(
  source: WorkoutSession,
  target: WorkoutSession,
  newGroupId: () => string
): WorkoutSession {
  const targetQueues = new Map<string, LoggedExercise[]>();
  for (const exercise of [...target.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const queue = targetQueues.get(exercise.exerciseId) ?? [];
    queue.push(exercise);
    targetQueues.set(exercise.exerciseId, queue);
  }

  const sourceToTargetId = new Map<string, string>();
  for (const exercise of [...source.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const match = targetQueues.get(exercise.exerciseId)?.shift();
    if (match) sourceToTargetId.set(exercise.id, match.id);
  }

  const groups: SupersetGroup[] = [];
  for (const sourceGroup of [...source.supersetGroups].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const memberOrder = sourceGroup.memberOrder
      .map((sourceId) => sourceToTargetId.get(sourceId))
      .filter((id): id is string => id !== undefined)
      .slice(0, MAX_SUPERSET_MEMBERS);
    if (memberOrder.length < 2 || new Set(memberOrder).size !== memberOrder.length) continue;
    groups.push({ id: newGroupId(), orderIndex: sourceGroup.orderIndex, memberOrder });
  }

  const groupByMemberId = new Map<string, string>();
  for (const group of groups) {
    for (const memberId of group.memberOrder) groupByMemberId.set(memberId, group.id);
  }

  let working: WorkoutSession = {
    ...target,
    exercises: target.exercises.map((exercise) => ({
      ...exercise,
      supersetGroupId: groupByMemberId.get(exercise.id) ?? null,
    })),
    supersetGroups: groups,
  };
  for (const group of groups) working = reorderSupersetGroupContiguously(working, group.id);
  return working;
}

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

/** Nombre de rounds réellement complétés par TOUS les membres du groupe. */
export function completedSupersetRounds(session: WorkoutSession, groupId: string): number {
  const group = session.supersetGroups.find((candidate) => candidate.id === groupId);
  if (!group || group.memberOrder.length < 2) return 0;

  const byId = new Map(session.exercises.map((exercise) => [exercise.id, exercise]));
  const counts = group.memberOrder.map((memberId) => {
    const member = byId.get(memberId);
    return member ? completedWorkVisits(session, member).length : 0;
  });
  return Math.min(...counts);
}

/** Prochain round auquel CET exercice participera (les composites valent une visite). */
export function nextSupersetRoundIndex(
  session: WorkoutSession,
  loggedExerciseId: string
): number | null {
  const group = groupForExercise(session, loggedExerciseId);
  const exercise = session.exercises.find((candidate) => candidate.id === loggedExerciseId);
  if (!group || !exercise || !group.memberOrder.includes(loggedExerciseId)) return null;
  return completedWorkVisits(session, exercise).length + 1;
}

/**
 * Prochain membre à activer dans le premier round encore incomplet. Si le tour
 * vient d'être complété, renvoie naturellement le premier membre du suivant.
 */
export function nextSupersetExerciseId(
  session: WorkoutSession,
  loggedExerciseId: string
): string | null {
  const group = groupForExercise(session, loggedExerciseId);
  if (!group || group.memberOrder.length < 2) return null;

  const byId = new Map(session.exercises.map((exercise) => [exercise.id, exercise]));
  const targetRound = completedSupersetRounds(session, group.id) + 1;
  for (const memberId of group.memberOrder) {
    const member = byId.get(memberId);
    if (member && completedWorkVisits(session, member).length < targetRound) return memberId;
  }
  return group.memberOrder[0] ?? null;
}

/**
 * Vrai si la visite contenant `setId` vient de rendre son round complet pour
 * tous les membres. Un warmup/finisher (absent des visites work) renvoie faux.
 */
export function isSupersetRoundComplete(
  session: WorkoutSession,
  loggedExerciseId: string,
  setId: string
): boolean {
  const group = groupForExercise(session, loggedExerciseId);
  const exercise = session.exercises.find((candidate) => candidate.id === loggedExerciseId);
  if (!group || !exercise || group.memberOrder.length < 2) return false;

  const visits = completedWorkVisits(session, exercise);
  const visitIndex = visits.findIndex((visit) => visit.sets.some((set) => set.id === setId));
  if (visitIndex === -1) return false;
  const round = visitIndex + 1;

  const byId = new Map(session.exercises.map((member) => [member.id, member]));
  return group.memberOrder.every((memberId) => {
    const member = byId.get(memberId);
    return member !== undefined && completedWorkVisits(session, member).length >= round;
  });
}

// ---------------------------------------------------------------------------
// handleSupersetLink — arm -> arm -> groupe
// ---------------------------------------------------------------------------

/** Aligne l'ordre persistant sur l'ordre visuel du bloc superset. */
export function reorderSupersetGroupContiguously(
  session: WorkoutSession,
  groupId: string
): WorkoutSession {
  const group = session.supersetGroups.find((candidate) => candidate.id === groupId);
  if (!group) return session;

  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const byId = new Map(ordered.map((exercise) => [exercise.id, exercise]));
  const members = group.memberOrder
    .map((memberId) => byId.get(memberId))
    .filter((member): member is LoggedExercise => member !== undefined);
  if (members.length < 2) return session;

  const memberIds = new Set(members.map((member) => member.id));
  const anchorIndex = Math.min(...members.map((member) => ordered.findIndex((item) => item.id === member.id)));
  const insertionIndex = ordered
    .slice(0, anchorIndex)
    .filter((exercise) => !memberIds.has(exercise.id)).length;
  const withoutMembers = ordered.filter((exercise) => !memberIds.has(exercise.id));
  withoutMembers.splice(insertionIndex, 0, ...members);
  const exercises = withoutMembers.map((exercise, index) => ({ ...exercise, orderIndex: index }));
  const nextGroup = { ...group, orderIndex: insertionIndex };

  return {
    ...session,
    exercises,
    supersetGroups: session.supersetGroups.map((candidate) =>
      candidate.id === groupId ? nextGroup : candidate
    ),
  };
}

function appendMemberToGroup(
  session: WorkoutSession,
  joiningExerciseId: string,
  groupId: string
): WorkoutSession {
  const group = session.supersetGroups.find((candidate) => candidate.id === groupId);
  const joining = session.exercises.find((exercise) => exercise.id === joiningExerciseId);
  if (
    !group ||
    !joining ||
    joining.supersetGroupId !== null ||
    group.memberOrder.includes(joiningExerciseId) ||
    group.memberOrder.length >= MAX_SUPERSET_MEMBERS
  ) {
    return session;
  }

  const updatedGroup = { ...group, memberOrder: [...group.memberOrder, joiningExerciseId] };
  let working: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === joiningExerciseId ? { ...exercise, supersetGroupId: groupId } : exercise
    ),
    supersetGroups: session.supersetGroups.map((candidate) =>
      candidate.id === groupId ? updatedGroup : candidate
    ),
  };
  working = reorderSupersetGroupContiguously(working, groupId);
  return recomputeSupersetRoundIndices(working, groupId);
}

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

  if (armedSupersetExerciseId === null) {
    if (loggedExercise.supersetGroupId !== null) {
      return { session: detachFromSupersetGroup(session, loggedExerciseId), armed: null };
    }
    return { session, armed: loggedExerciseId };
  }

  if (armedSupersetExerciseId === loggedExerciseId) {
    return { session, armed: null };
  }

  const armed = session.exercises.find((e) => e.id === armedSupersetExerciseId);
  if (!armed) return { session, armed: null };

  // Un exercice libre armé peut rejoindre un groupe existant en touchant
  // n'importe lequel de ses membres (tri-/giant-set, maximum quatre membres).
  if (loggedExercise.supersetGroupId !== null && armed.supersetGroupId === null) {
    const joined = appendMemberToGroup(session, armed.id, loggedExercise.supersetGroupId);
    return { session: joined, armed: joined === session ? armedSupersetExerciseId : null };
  }

  // Symétrique pour les appels programmatiques qui arment déjà un membre de groupe.
  if (armed.supersetGroupId !== null && loggedExercise.supersetGroupId === null) {
    const joined = appendMemberToGroup(session, loggedExercise.id, armed.supersetGroupId);
    return { session: joined, armed: joined === session ? armedSupersetExerciseId : null };
  }

  if (loggedExercise.supersetGroupId !== null || armed.supersetGroupId !== null) {
    return { session, armed: null };
  }

  const groupId = newGroupId();
  const group: SupersetGroup = {
    id: groupId,
    orderIndex: Math.min(armed.orderIndex, loggedExercise.orderIndex),
    memberOrder: [armed.id, loggedExercise.id],
  };
  let working: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === armed.id || exercise.id === loggedExercise.id
        ? { ...exercise, supersetGroupId: groupId }
        : exercise
    ),
    supersetGroups: [...session.supersetGroups, group],
  };
  working = reorderSupersetGroupContiguously(working, groupId);
  working = recomputeSupersetRoundIndices(working, groupId);
  return { session: working, armed: null };
}

/**
 * Miroir de `WorkoutViewModel.detachFromSupersetGroup`. Si le groupe tombe
 * sous 2 membres, il est entièrement supprimé (pas de "superset solo").
 */
export function detachFromSupersetGroup(session: WorkoutSession, loggedExerciseId: string): WorkoutSession {
  const loggedExercise = session.exercises.find((e) => e.id === loggedExerciseId);
  if (!loggedExercise || loggedExercise.supersetGroupId === null) return session;

  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) {
    return {
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === loggedExerciseId
          ? clearSupersetRounds({ ...exercise, supersetGroupId: null })
          : exercise
      ),
    };
  }

  const memberOrder = group.memberOrder.filter((id) => id !== loggedExerciseId);

  if (memberOrder.length < 2) {
    // Unpair everyone and delete the group entirely.
    const memberIds = new Set(group.memberOrder);
    return {
      ...session,
      exercises: session.exercises.map((e) =>
        memberIds.has(e.id) || e.supersetGroupId === group.id
          ? clearSupersetRounds({ ...e, supersetGroupId: null })
          : e
      ),
      supersetGroups: session.supersetGroups.filter((g) => g.id !== group.id),
    };
  }

  const updatedGroup: SupersetGroup = { ...group, memberOrder };
  let working: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((e) =>
      e.id === loggedExerciseId
        ? clearSupersetRounds({ ...e, supersetGroupId: null })
        : e
    ),
    supersetGroups: session.supersetGroups.map((g) => (g.id === group.id ? updatedGroup : g)),
  };
  working = reorderSupersetGroupContiguously(working, group.id);
  return recomputeSupersetRoundIndices(working, group.id);
}

/** Miroir de `WorkoutViewModel.toggleSuperset`. */
export function toggleSuperset(
  session: WorkoutSession,
  loggedExerciseId: string,
  armedSupersetExerciseId: string | null,
  newGroupId: () => string
): SupersetLinkResult {
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

function supersetVisitPoints(session: WorkoutSession): SupersetPoint[] {
  return session.exercises
    .flatMap((logged) =>
      completedWorkVisits(session, logged).map((visit) => ({
        exerciseId: logged.id,
        timestamp: visit.timestamp,
      }))
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Permet au store de tester un set comme work AVANT qu'une heuristique ne le
 * transforme en finisher. On protège aussi les préfixes du second cycle
 * (ABCD-A, ABCD-AB, etc.) : attendre uniquement ABCDABCD convertirait B2/C2
 * en finishers et rendrait le giant-set impossible à détecter.
 */
export function wouldCompleteSupersetPattern(
  session: WorkoutSession,
  loggedExerciseId: string,
  candidate: Pick<LoggedSet, "weight" | "reps" | "setType" | "timestamp" | "setSlotIndex">
): boolean {
  const exercise = session.exercises.find((logged) => logged.id === loggedExerciseId);
  if (!exercise) return false;

  const provisional: LoggedSet = {
    id: "__superset_candidate__",
    weight: candidate.weight,
    reps: candidate.reps,
    setType: candidate.setType,
    timestamp: candidate.timestamp,
    setSlotIndex: candidate.setSlotIndex,
    completed: true,
    supersetRoundIndex: null,
  };
  const hypothetical: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((logged) =>
      logged.id === loggedExerciseId ? { ...logged, sets: [...logged.sets, provisional] } : logged
    ),
  };
  const points = supersetVisitPoints(hypothetical).slice(-24);
  const ids = points.map((point) => point.exerciseId);

  for (let size = 4; size >= 2; size -= 1) {
    for (let start = 0; start + size < ids.length; start += 1) {
      const candidateSequence = ids.slice(start);
      if (candidateSequence.length > size * 2) continue;
      const template = candidateSequence.slice(0, size);
      if (new Set(template).size !== size || !template.includes(loggedExerciseId)) continue;
      const followsCycle = candidateSequence.every((id, index) => id === template[index % size]);
      if (!followsCycle) continue;

      let gapsArePlausible = true;
      for (let index = start; index < points.length - 1; index += 1) {
        if (points[index + 1].timestamp - points[index].timestamp > MAX_GAP_MS) {
          gapsArePlausible = false;
          break;
        }
      }
      if (gapsArePlausible) return true;
    }
  }

  return false;
}

/**
 * Miroir de `WorkoutViewModel.detectSupersetMembers`. Cherche un pattern
 * A→B→(C→D→)A→B... sur les visites fournies, avec au moins 2 rounds complets et sans
 * gap > 240s entre deux sets consécutifs du pattern détecté.
 */
export function detectSupersetMembers(points: SupersetPoint[]): string[] | null {
  if (points.length < 3) return null;
  const ids = points.map((p) => p.exerciseId);

  for (let size = 4; size >= 2; size--) {
    if (ids.length < size + 1) continue;
    for (let start = 0; start < ids.length - size; start++) {
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
 * nouvelle session avec `supersetRoundIndex` recalculé pour toutes les visites
 * work des membres. Chaque membre porte le numéro de sa nième visite; un round
 * global n'est considéré terminé que lorsque tous les membres ont atteint ce
 * numéro (`completedSupersetRounds`). Les warmups/finishers sont remis à null.
 */
export function recomputeSupersetRoundIndices(session: WorkoutSession, groupId: string): WorkoutSession {
  const group = session.supersetGroups.find((g) => g.id === groupId);
  if (!group) return session;

  const membersById = new Map(session.exercises.map((e) => [e.id, e]));
  const order = group.memberOrder.map((id) => membersById.get(id)).filter((e): e is LoggedExercise => e !== undefined);
  if (order.length === 0) return session;

  const newRoundBySetId = new Map<string, number>();
  for (const exercise of order) {
    completedWorkVisits(session, exercise).forEach((visit, index) => {
      const round = index + 1;
      for (const set of visit.sets) newRoundBySetId.set(set.id, round);
    });
  }

  const memberIds = new Set(group.memberOrder);
  return {
    ...session,
    exercises: session.exercises.map((e) => {
      if (!memberIds.has(e.id)) return e;
      return {
        ...e,
        sets: e.sets.map((s) => {
          const round = newRoundBySetId.get(s.id) ?? null;
          return s.supersetRoundIndex === round ? s : { ...s, supersetRoundIndex: round };
        }),
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
  const points = supersetVisitPoints(session);

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
    if (allSameGroup && existing && arraysEqualAsSets(existing.memberOrder, memberIds)) {
      // Une rotation cyclique détectée après le déplacement de la fenêtre ne
      // doit jamais réordonner un groupe existant. On conserve son ordre stable
      // tout en réparant les rounds et la contiguïté du bloc.
      let stable = reorderSupersetGroupContiguously(session, existing.id);
      stable = recomputeSupersetRoundIndices(stable, existing.id);
      return stable;
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

  working = reorderSupersetGroupContiguously(working, newGroup.id);
  return recomputeSupersetRoundIndices(working, newGroup.id);
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

  const movingId = ordered[fromIndex].id;
  const working = detachFromSupersetGroup(session, movingId);
  const reOrdered = [...working.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const movingIndex = reOrdered.findIndex((exercise) => exercise.id === movingId);
  if (movingIndex === -1) return working;

  const mutable = [...reOrdered];
  const [moving] = mutable.splice(movingIndex, 1);
  const clampedTo = Math.max(0, Math.min(toIndex, mutable.length));
  mutable.splice(clampedTo, 0, moving);

  return { ...working, exercises: mutable.map((e, i) => ({ ...e, orderIndex: i })) };
}
