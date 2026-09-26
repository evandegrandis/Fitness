/**
 * Succès cachés (Evan, 26/09/2026 : « ne me les dis pas »).
 *
 * Ne jamais les décrire à Evan, ni dans une réponse, ni dans une PR, ni dans CLAUDE.md : il les
 * découvre en jouant. L'app n'affiche un secret qu'une fois débloqué ; les autres ne laissent
 * aucune trace à l'écran, pas même leur nombre.
 */

import type { SessionRank } from "@/lib/engines/session-rank";
import type { WorkoutSession } from "@/lib/models/types";

/** Ce que le parcours sait au moment où une séance se termine (recalculé pour tout le passé). */
export interface SecretContext {
  session: WorkoutSession;
  /** Séances terminées, celle-ci comprise. */
  sessionCount: number;
  firstSessionDate: Date;
  /** Jours depuis la séance précédente (`null` pour la première). */
  gapDays: number | null;
  startHour: number;
  durationMinutes: number | null;
  rated: number;
  performed: number;
  /** Exercices étoilés dans la séance. */
  recordExercises: number;
  levelUps: number;
  /** Meilleur écart avec le fantôme de 4 semaines, tous exercices confondus (0,1 = +10 %). */
  bestGhostGain: number | null;
  rank: SessionRank | null;
  /** Rangs des séances précédentes, de la plus ancienne à la plus récente. */
  previousRanks: readonly (SessionRank | null)[];
  /** Séances par semaine civile, jusqu'à celle-ci, de la plus ancienne à la courante. */
  sessionsPerWeek: readonly number[];
  /** Séries de la semaine civile en cours, séance comprise. */
  weekSets: number;
  /** Rangs des séances de la semaine civile en cours, séance comprise. */
  weekRanks: readonly (SessionRank | null)[];
  /** Séries étoilées de la semaine civile en cours, séance comprise. */
  weekRecordSets: number;
  /** Jours de la semaine (0 = dimanche) où une séance a déjà eu lieu. */
  weekdays: ReadonlySet<number>;
  /** Paliers des semaines terminées puis de la semaine en cours (« or » inclus). */
  goldWeeksInARow: number;
}

export interface SecretDefinition {
  id: string;
  title: string;
  /** Affiché seulement une fois le secret trouvé. */
  description: string;
  unlocked: (context: SecretContext) => boolean;
}

const DAY_MS = 86_400_000;

export const SECRETS: readonly SecretDefinition[] = [
  { id: "aube", title: "Aube", description: "Une séance commencée avant 7 h.", unlocked: (c) => c.startHour < 7 },
  { id: "minuit", title: "Minuit", description: "Une séance commencée après 22 h.", unlocked: (c) => c.startHour >= 22 },
  { id: "triple", title: "Triplé", description: "Trois exercices étoilés dans la même séance.", unlocked: (c) => c.recordExercises >= 3 },
  { id: "razzia", title: "Razzia", description: "Cinq exercices étoilés dans la même séance.", unlocked: (c) => c.recordExercises >= 5 },
  {
    id: "marathon",
    title: "Marathon",
    description: "Une séance de plus de deux heures et demie.",
    unlocked: (c) => (c.durationMinutes ?? 0) >= 150,
  },
  {
    id: "sans-faute",
    title: "Sans faute",
    description: "Six exercices ou plus, tous au-dessus de la référence.",
    unlocked: (c) => c.rated >= 6 && c.performed === c.rated,
  },
  { id: "premier-s", title: "Premier S", description: "Ton premier rang S.", unlocked: (c) => c.rank?.letter === "S" },
  {
    id: "trois-s",
    title: "Trois S",
    description: "Trois rangs S d'affilée.",
    unlocked: (c) => c.rank?.letter === "S" && c.previousRanks.slice(-2).filter((rank) => rank?.letter === "S").length === 2,
  },
  {
    id: "dix-s",
    title: "Dix S",
    description: "Dix rangs S.",
    unlocked: (c) => c.rank?.letter === "S" && c.previousRanks.filter((rank) => rank?.letter === "S").length >= 9,
  },
  {
    id: "lancee",
    title: "Sur sa lancée",
    description: "Cinq séances d'affilée au rang A ou mieux.",
    unlocked: (c) => [...c.previousRanks.slice(-4), c.rank].filter((rank) => rank?.letter === "S" || rank?.letter === "A").length === 5,
  },
  {
    id: "tranchant",
    title: "Tranchant",
    description: "Un rang S en pleine sèche.",
    unlocked: (c) => c.rank?.letter === "S" && c.rank.cut,
  },
  {
    id: "semaine-parfaite",
    title: "Semaine parfaite",
    description: "Quatre séances dans la semaine, toutes au rang A ou mieux.",
    unlocked: (c) => c.weekRanks.length >= 4 && c.weekRanks.every((rank) => rank?.letter === "S" || rank?.letter === "A"),
  },
  {
    id: "moisson",
    title: "Moisson",
    description: "Dix records dans la même semaine.",
    unlocked: (c) => c.weekRecordSets >= 10,
  },
  {
    id: "remontada",
    title: "Remontada",
    description: "Un rang S juste après un rang C.",
    unlocked: (c) => c.rank?.letter === "S" && c.previousRanks.at(-1)?.letter === "C",
  },
  {
    id: "retour",
    title: "Le retour",
    description: "Un record dès la reprise, après au moins deux semaines sans séance.",
    unlocked: (c) => (c.gapDays ?? 0) >= 14 && c.recordExercises >= 1,
  },
  {
    id: "metronome",
    title: "Métronome",
    description: "Quatre séances par semaine, quatre semaines de suite.",
    unlocked: (c) => c.sessionsPerWeek.length >= 4 && c.sessionsPerWeek.slice(-4).every((count) => count >= 4),
  },
  {
    id: "sept-jours",
    title: "Sept jours",
    description: "Au moins une séance chaque jour de la semaine, du lundi au dimanche, sur tout ton parcours.",
    unlocked: (c) => c.weekdays.size === 7,
  },
  { id: "double-palier", title: "Double palier", description: "Deux passages de niveau dans la même séance.", unlocked: (c) => c.levelUps >= 2 },
  {
    id: "fantome",
    title: "Plus fort que ton fantôme",
    description: "+10 % de 1RM estimé sur toi-même, quatre semaines plus tôt.",
    unlocked: (c) => (c.bestGhostGain ?? 0) >= 0.1,
  },
  {
    id: "fantome-ecrase",
    title: "Fantôme écrasé",
    description: "+20 % de 1RM estimé sur toi-même, quatre semaines plus tôt.",
    unlocked: (c) => (c.bestGhostGain ?? 0) >= 0.2,
  },
  {
    id: "volume",
    title: "Quatre-vingt-dix",
    description: "Une semaine à 90 séries.",
    unlocked: (c) => c.weekSets >= 90,
  },
  { id: "or-massif", title: "Or massif", description: "Deux semaines en or d'affilée.", unlocked: (c) => c.goldWeeksInARow >= 2 },
  {
    id: "six-mois",
    title: "Six mois",
    description: "Six mois depuis ta première séance, et toujours là.",
    unlocked: (c) => c.session.date.getTime() - c.firstSessionDate.getTime() >= 182 * DAY_MS,
  },
  {
    id: "un-an",
    title: "Un an",
    description: "Un an depuis ta première séance.",
    unlocked: (c) => c.session.date.getTime() - c.firstSessionDate.getTime() >= 365 * DAY_MS,
  },
];
