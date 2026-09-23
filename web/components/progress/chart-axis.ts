/**
 * Axe Y lisible : étiquettes formatées et largeur calculée d'après le texte réel.
 *
 * Les graphiques fixaient une largeur d'axe (34 px, 44 px) puis la compensaient par une marge
 * gauche négative pour gagner de la place : dès qu'une charge passait à trois chiffres, le début
 * de l'étiquette sortait du cadre (« 107 » affiché « 07 »). La largeur découle maintenant des
 * étiquettes que l'axe affichera, et la marge gauche reste à zéro.
 */

/** Largeur moyenne d'un chiffre tabulaire, en fraction de la taille de police. */
const DIGIT_WIDTH_EM = 0.62;
/** Place prise par la graduation (masquée mais réservée par Recharts) et la marge du texte. */
const TICK_GUTTER_PX = 10;

/**
 * Nombre affiché sur un graphique (axe, étiquette de barre, infobulle) : format français, au plus
 * `decimals` décimales. Les totaux de séries effectives s'additionnent par dixièmes et laissaient
 * passer des résidus de calcul (« 59.99999999999994 »).
 */
export function formatChartNumber(value: number, decimals: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/**
 * Largeur qui contient la plus longue étiquette possible du domaine : partie entière de la borne
 * la plus grande en valeur absolue, virgule et décimales, signe moins éventuel.
 */
export function yAxisWidth(domain: readonly [number, number], decimals: number, fontSize: number): number {
  const magnitude = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
  const integerDigits = Math.max(1, Math.floor(magnitude).toString().length);
  const characters =
    integerDigits + (decimals > 0 ? decimals + 1 : 0) + (Math.min(domain[0], domain[1]) < 0 ? 1 : 0);
  return Math.ceil(characters * fontSize * DIGIT_WIDTH_EM) + TICK_GUTTER_PX;
}
