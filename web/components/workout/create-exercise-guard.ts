/**
 * Quand un tap sur « Créer « … » » crée vraiment l'exercice.
 *
 * Le 01/10/2026 en salle, l'app a créé « Trac » alors qu'Evan tapait encore « Traction largeur
 * épaule » : la carte de création apparaît dès les premières lettres, en bas d'une liste qui se
 * réduit à chaque touche, et un tap destiné au clavier ou à une ligne qui venait de bouger la
 * touchait. Règle : un tap reçu pendant la frappe (une touche il y a moins de `CREATE_SETTLE_MS`)
 * ne crée rien ; il ferme le clavier et ARME la carte, qui dit alors « Touche encore pour créer ».
 * Un nom tapé puis relu (pause d'au moins `CREATE_SETTLE_MS`) se crée d'un seul tap, comme avant.
 */

/** Pause après la dernière touche au-delà de laquelle la frappe est considérée finie. */
export const CREATE_SETTLE_MS = 1_200;

/** En dessous, aucun nom d'exercice plausible : la carte n'apparaît pas. */
export const CREATE_MIN_LENGTH = 3;

export type CreateTapDecision = "create" | "arm" | "ignore";

export function canOfferCreate(query: string, catalogNames: readonly string[]): boolean {
  const trimmed = query.trim();
  if (trimmed.length < CREATE_MIN_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  return !catalogNames.some((name) => name.trim().toLowerCase() === lower);
}

export function createTapDecision(input: {
  query: string;
  /** Heure (ms) de la dernière modification du champ, null si jamais touché. */
  lastKeyAt: number | null;
  /** La carte a déjà été armée par un tap précédent, pour CE texte. */
  armed: boolean;
  now: number;
}): CreateTapDecision {
  if (input.query.trim().length < CREATE_MIN_LENGTH) return "ignore";
  if (input.armed) return "create";
  if (input.lastKeyAt !== null && input.now - input.lastKeyAt < CREATE_SETTLE_MS) return "arm";
  return "create";
}
