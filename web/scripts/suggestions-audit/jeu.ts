/**
 * Le jeu tel que l'app le compte, sur un export de données (LECTURE SEULE, voir `web/SUGGESTIONS.md`) :
 * cibles battues, compteur et combo (`sessionGame`), Discipline de la fiche (`buildCareer` puis la fenêtre de
 * `character.ts`), et bilan de fin de séance (`debriefSession`, face à la cible de la 1re série).
 *
 * Usage (depuis `web/`) :
 *   TZ=Europe/Paris npx tsx scripts/suggestions-audit/jeu.ts <export.json> [--cibles <rejeu.jsonl>] [--depuis 2026-08-17] [--au 2026-10-11]
 * `--cibles` remplace les cibles enregistrées par celles d'un rejeu (`replay.ts --simuler`) : le jeu qu'Evan aurait
 * eu avec ce moteur. Pour juger avec les règles d'un AUTRE moteur (avant/après une règle) :
 *   cd <autre worktree>/web && TZ=Europe/Paris npx tsx --tsconfig ./tsconfig.json <ce fichier> <export.json> ...
 * N'écrit rien : un tableau sur la sortie standard.
 */
import { readFileSync } from "node:fs";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DAY_MS = 86_400_000;

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) options.set(args[i].slice(2), args[++i]);
    else positional.push(args[i]);
  }
  const [dataPath] = positional;
  if (!dataPath) {
    console.error("usage : jeu.ts <export.json> [--cibles <rejeu.jsonl>] [--depuis AAAA-MM-JJ] [--au AAAA-MM-JJ]");
    process.exit(1);
  }
  const sinceDay = options.get("depuis") ?? "2026-08-17";
  const untilDay = options.get("au") ?? new Date().toISOString().slice(0, 10);
  const since = new Date(`${sinceDay}T00:00:00`);
  const until = new Date(`${untilDay}T23:59:59`);

  const { sessionGame } = await import("@/lib/engines/session-game");
  const { buildCareer } = await import("@/lib/engines/career");
  const { debriefSession } = await import("@/lib/engines/session-insights");
  const { heldReference } = await import("@/lib/engines/session-rank");
  type AllData = import("@/lib/db/queries").AllData;
  type WorkoutSession = import("@/lib/models/types").WorkoutSession;

  const data = JSON.parse(readFileSync(dataPath, "utf8"), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as AllData;
  const targets = new Map<string, { weight: number; reps: number }>();
  const ciblesPath = options.get("cibles");
  if (ciblesPath) {
    for (const line of readFileSync(ciblesPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { set_id: string; set_type: string; engine: { weight: number; reps: number } };
      if (row.set_type !== "warmup") targets.set(row.set_id, { weight: row.engine.weight, reps: row.engine.reps });
    }
  }
  const withTargets = (session: WorkoutSession): WorkoutSession =>
    targets.size === 0
      ? session
      : {
          ...session,
          exercises: session.exercises.map((logged) => ({
            ...logged,
            sets: logged.sets.map((set) => {
              const target = targets.get(set.id);
              return target ? { ...set, suggestedWeight: target.weight, suggestedReps: target.reps } : set;
            }),
          })),
        };
  const sessions = data.sessions
    .filter((session) => !session.isActive && session.date <= until)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(withTargets);
  const catalog = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));

  // Compteur et combo, comme l'en-tête de séance.
  const games = sessions
    .filter((session) => session.date >= since)
    .map((session) => sessionGame(session, data.exercises, sessions.filter((past) => past.date < session.date)))
    .filter((game) => game.rated > 0);
  const sum = (key: "rated" | "beaten" | "held" | "below" | "bestCombo") => games.reduce((total, game) => total + game[key], 0);

  // Discipline de la fiche : rangs du parcours, fenêtre de `character.ts` (28 jours) et depuis `--depuis`.
  const career = buildCareer({ history: sessions, catalog: data.exercises, goals: data.goals, bodyWeights: data.bodyWeights, settings: data.settings, now: until });
  const discipline = (from: Date) => {
    let rated = 0;
    let kept = 0;
    for (const session of sessions) {
      const rank = career.bySession.get(session.id)?.rank;
      if (!rank || session.date < from) continue;
      rated += rank.rated;
      kept += rank.performed + rank.held;
    }
    return { rated, kept };
  };

  // Bilan de fin de séance : la meilleure série de chaque exercice face à la cible de sa 1re série.
  let bilanRated = 0;
  let bilanPerformed = 0;
  let bilanHeld = 0;
  for (const session of sessions.filter((s) => s.date >= since)) {
    const { review } = debriefSession(session, sessions, data.exercises, data.goals, { trainingPhase: data.settings.trainingPhase });
    for (const exercise of review.exercises.filter((e) => !e.calibrating && !e.noData)) {
      bilanRated += 1;
      if (exercise.performed) bilanPerformed += 1;
      else if (heldReference(exercise, catalog.get(exercise.exerciseId))) bilanHeld += 1;
    }
  }

  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : "-");
  const window = discipline(new Date(until.getTime() - 28 * DAY_MS));
  const all = discipline(since);
  console.log(`Cibles : ${ciblesPath ? `rejeu ${ciblesPath}` : "enregistrées (vécu)"} ; séances du ${sinceDay} au ${untilDay}`);
  console.log(`Séances jugées ${games.length}, séries jugées ${sum("rated")}`);
  console.log(`Cibles battues ${pct(sum("beaten"), sum("rated"))} ; tenues ${pct(sum("held"), sum("rated"))} ; en dessous ${pct(sum("below"), sum("rated"))}`);
  console.log(`Compteur (battues par séance) ${(sum("beaten") / games.length).toFixed(1)} ; meilleur combo moyen ${(sum("bestCombo") / games.length).toFixed(1)}`);
  console.log(`Discipline (fiche) 28 derniers jours ${pct(window.kept, window.rated)} (${window.rated} exercices) ; depuis le début ${pct(all.kept, all.rated)} (${all.rated})`);
  console.log(`Bilan : exercices au-dessus de la cible de leur 1re série ${pct(bilanPerformed, bilanRated)}, tenus ${pct(bilanHeld, bilanRated)} (${bilanRated} exercices)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
