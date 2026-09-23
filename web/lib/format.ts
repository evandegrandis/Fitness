/**
 * Formatage des nombres AFFICHÉS, à la française. Dix copies de la même fonction écrivaient les
 * poids avec un point décimal (« 62.5 kg ») dans une interface en français. Une seule source,
 * virgule décimale, deux décimales au plus, sans séparateur de milliers (un poids reste lisible
 * d'un coup d'œil). Réservé à l'affichage : ne jamais relire ces chaînes comme des nombres.
 */
export function cleanWeight(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  return rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false });
}

/** Nombre décimal affiché (séries effectives, moyennes), à la française. */
export function formatDecimal(value: number, maxDecimals = 1): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: maxDecimals, useGrouping: false });
}

/** Libellé de charge : « 62,5 kg », ou « PDC » au poids du corps (jamais « BW »). */
export function formatLoad(weight: number, separator = " "): string {
  return weight > 0 ? `${cleanWeight(weight)}${separator}kg` : "PDC";
}
