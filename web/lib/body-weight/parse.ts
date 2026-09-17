/**
 * Lecture tolérante de la date d'une pesée envoyée par Raccourcis iOS ou Barbis.
 */

const FRENCH_MONTHS: Record<string, number> = {
  janv: 1, janvier: 1, fevr: 2, fev: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7,
  aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12,
};

/** Décalage de Paris (« +02:00 » / « +01:00 ») pour un instant donné, pour ne pas figer l'heure d'été. */
function parisOffset(year: number, month: number, day: number, hour: number, minute: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
    .formatToParts(probe).find((item) => item.type === "timeZoneName")?.value ?? "GMT+01:00";
  return part.replace("GMT", "") || "+00:00";
}

function isoInParis(year: number, month: number, day: number, hour: number, minute: number): string | null {
  if (!(year > 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour < 24 && minute >= 0 && minute < 60)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${parisOffset(year, month, day, hour, minute)}`;
}

/** Accepte ISO 8601, « 2026-09-17 », « 15 sept. 2026 à 09:41 », « 15/09/2026 09:41 ». */
export function parseMeasuredOn(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return isoInParis(Number(match[1]), Number(match[2]), Number(match[3]), 8, 0);
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (match) return isoInParis(Number(match[3]), Number(match[2]), Number(match[1]), Number(match[4] ?? 8), Number(match[5] ?? 0));
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  match = normalized.match(/^(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const month = FRENCH_MONTHS[match[2]!];
    if (!month) return null;
    return isoInParis(Number(match[3]), month, Number(match[1]), Number(match[4] ?? 8), Number(match[5] ?? 0));
  }
  return null;
}

/**
 * Nombre tel que Raccourcis rend une valeur Santé en français : « 75,6 kg »,
 * « 12 345 pas » (séparateur de milliers : espace, insécable ou fine),
 * « 1 234,5 kcal ». Retourne NaN si aucun nombre n'est lisible.
 */
export function parseNumberish(value: string): number {
  const match = value.match(/-?\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/);
  if (!match) return Number.NaN;
  return Number(match[0].replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
}
