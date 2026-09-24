/**
 * Exercices dont on peut reprendre le profil musculaire, pour un exercice qui n'en a aucun.
 *
 * Un exercice créé en salle sous un nom inconnu naît sans muscles : ses séries ne comptent alors
 * dans aucun objectif. Plutôt que de deviner à sa place (une supposition fausserait la
 * couverture), l'app lui propose les exercices du catalogue qui y ressemblent le plus, et Evan
 * choisit d'un tap. Le profil est COPIÉ, comme pour les profils connus : jamais inventé.
 */

import { normalizeCatalogExerciseName, stripMachineBrand } from "@/lib/data/catalog-muscle-profiles";
import { normalizeSearch, searchTermsFor } from "@/lib/data/exercise-search";
import { areEquivalent } from "@/lib/engines/equivalence";
import type { Exercise } from "@/lib/models/types";

/** Mots qui ne disent rien du mouvement. */
const NOISE_WORDS = new Set(["machine", "de", "du", "des", "a", "au", "aux", "la", "le", "les", "l", "d", "et", "en", "sur", "avec", "the", "of"]);

/** Même mouvement sur une autre marque : c'est le meilleur donneur possible. */
const EQUIVALENT_BONUS = 10;

export const MAX_MUSCLE_PROFILE_DONORS = 3;

function meaningfulWords(name: string): string[] {
  const withoutBrand = stripMachineBrand(normalizeCatalogExerciseName(name));
  return normalizeSearch(withoutBrand)
    .split(" ")
    .filter((word) => word.length > 1 && !NOISE_WORDS.has(word));
}

/**
 * Donneurs classés : machine équivalente d'abord, puis ressemblance du nom, puis l'exercice
 * pratiqué le plus récemment (le plus susceptible d'être dans la salle du moment).
 *
 * La ressemblance pèse chaque mot par sa RARETÉ dans le catalogue : un mot retrouvé chez un seul
 * exercice (« rowing ») en dit bien plus qu'un mot retrouvé partout (« press », « bar »). Sans
 * cette pondération, « Rowing T-bar » remontait « Extension triceps poulie » pour un simple « bar ».
 */
export function muscleProfileDonors(
  exercise: Exercise,
  catalog: readonly Exercise[],
  limit: number = MAX_MUSCLE_PROFILE_DONORS
): Exercise[] {
  const words = meaningfulWords(exercise.name);
  const candidates = catalog
    .filter((candidate) => candidate.id !== exercise.id && candidate.muscleMappings.length > 0)
    .map((candidate) => ({ candidate, terms: searchTermsFor(candidate) }));
  const matches = (terms: string[], word: string) => terms.some((term) => term.includes(word));
  const weightByWord = new Map(
    words.map((word) => {
      const count = candidates.filter((entry) => matches(entry.terms, word)).length;
      return [word, count > 0 ? 1 / count : 0] as const;
    })
  );

  const ranked = candidates
    .map(({ candidate, terms }) => {
      const resemblance = words.reduce(
        (sum, word) => sum + (matches(terms, word) ? weightByWord.get(word) ?? 0 : 0),
        0
      );
      const score = resemblance + (areEquivalent(exercise, candidate) ? EQUIVALENT_BONUS : 0);
      return { candidate, score, lastUsed: candidate.lastUsed?.getTime() ?? 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lastUsed - a.lastUsed ||
        a.candidate.name.localeCompare(b.candidate.name, "fr")
    );
  // Un candidat deux fois moins ressemblant que le meilleur n'est qu'une coïncidence de mot.
  return ranked
    .filter((entry) => entry.score * 2 >= ranked[0].score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/**
 * L'exercice avec le profil du donneur. Catégorie et type de mouvement ne sont repris que s'ils
 * manquaient : un réglage explicite reste prioritaire, comme pour les profils connus.
 */
export function withDonorProfile(exercise: Exercise, donor: Exercise): Exercise {
  const category = exercise.category.trim();
  return {
    ...exercise,
    muscleMappings: donor.muscleMappings.map((mapping) => ({ ...mapping })),
    category: category.length === 0 || normalizeCatalogExerciseName(category) === "autre" ? donor.category : exercise.category,
    movementPattern: exercise.movementPattern ?? donor.movementPattern,
    profileSource: "donor",
  };
}
