/**
 * Mapping manuel « nom d'exercice (FR) → GIF de démonstration ».
 *
 * Source : dataset public hasaneyldrm/exercises-dataset (1324 exercices,
 * GIFs 180×180). Servi à la demande via le CDN jsDelivr — AUCUN fichier
 * embarqué dans le bundle, AUCun chargement tant que l'utilisateur ne
 * demande pas explicitement la démo (voir `ExerciseGif`). Compatible avec
 * l'usage hors-ligne : à la salle sans réseau, la démo ne se charge
 * simplement pas (dégradation silencieuse), sans jamais casser l'UI.
 *
 * © GIFs : dataset communautaire, usage personnel. Attribution affichée
 * dans Réglages (section Sauvegarde/À propos).
 *
 * Mapping CURÉ à la main : seules les correspondances sûres sont incluses.
 * Les exercices trop spécifiques/ambigus (ex. "Pulley serré", "DC assisté",
 * "Row uni") sont volontairement OMIS — mieux vaut pas de démo qu'une démo
 * fausse. `exerciseGifUrl` renvoie `null` pour eux.
 */

const CDN_BASE = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos";

/** nom exact du catalogue (FR) → nom de fichier GIF `{id}-{hash}.gif`. */
const GIF_BY_NAME: Record<string, string> = {
  "Chest Press": "0577-T0yTjgW.gif", // lever chest press (machine)
  "Curl debout": "0294-NbVPDMW.gif", // dumbbell biceps curl
  "Tractions SN": "0651-0V2YQjW.gif", // pull up (neutral grip)
  "Lateral raises": "0334-DsgkuIt.gif", // dumbbell lateral raise
  "Dips machine": "0019-J60bN17.gif", // assisted triceps dip (machine)
  "Développé incliné haltères": "0314-ns0SIbU.gif", // dumbbell incline bench press
  "Shoulder press": "0405-znQUdHY.gif", // dumbbell seated shoulder press
  "Isolateral row": "0588-IGjKj1v.gif", // lever narrow grip seated row (machine)
  "Crunch déclinés": "0277-9Ap7miY.gif", // decline crunch
  "Wrist curl": "1412-SJAA2IQ.gif", // barbell palms up wrist curl
  "Relevé de jambes chaise romaine": "2963-weoDEpH.gif", // captains chair leg raise
  "Pec deck": "0596-v3xmPAR.gif", // lever seated fly
  "Extension triceps haltère": "0351-mpKZGWz.gif", // dumbbell lying triceps extension
  HSPU: "0471-rQxwMxO.gif", // handstand push-up
  "Rear delt fly": "0383-EAs3xL9.gif", // dumbbell reverse fly
  "Leg extension": "0585-my33uHU.gif", // lever leg extension
  "Extension triceps poulie": "0201-3ZflifB.gif", // cable pushdown
  "Curl marteau poulie": "0165-HPlPoQA.gif", // cable hammer curl (rope)
  "Tirage vertical muscle up": "2330-LEprlgG.gif", // cable lat pulldown
  "Curl incliné": "0318-ae9UoXQ.gif", // dumbbell incline curl
  "Tirage horizontal large": "0861-fUBheHs.gif", // cable seated row
  "Leg curl": "0586-17lJ1kr.gif", // lever lying leg curl
  "Traction pronation large": "1429-Qqi7bko.gif", // wide grip pull-up
  "Ab roller genoux": "0857-NAgVB3t.gif", // wheel rollerout (kneeling)
  Dips: "0251-9WTm7dq.gif", // chest dip
};

/** URL du GIF de démo pour un exercice, ou `null` si aucune correspondance sûre. */
export function exerciseGifUrl(exerciseName: string): string | null {
  const file = GIF_BY_NAME[exerciseName];
  return file ? `${CDN_BASE}/${file}` : null;
}

/** `true` si une démo existe pour cet exercice (pour afficher l'icône dans le picker). */
export function hasExerciseGif(exerciseName: string): boolean {
  return exerciseName in GIF_BY_NAME;
}
