# Journal du chantier BILAN (branche web/bilan-intelligent)

Worktree : `~/.local/share/barbis-dev/jeera-bilan` · PR : (pas encore ouverte)

## Reprise
```
cd ~/.local/share/barbis-dev/jeera-bilan && git fetch -q && git rebase origin/web/nextjs-app
cd web && npm ci   # si node_modules incomplet
```
Puis lire ce journal, reprendre à « Reste à faire ».

## Fait
- 07/10 : worktree créé, lecture CLAUDE.md, AGENTS.md, DATA_SAFETY.md, bilan.ts, template-recommendation.ts, store (sessionReview, fatigue).

- 07/10 : copie lecture seule de la prod (rôle `barbis_backup`) dans `~/.local/share/barbis-dev/jeera-bilan-data/alldata-2026-10-07.json` (hors dépôt) ; analyse des habitudes : `habitudes-depuis-0910.txt` (même dossier, scripts `dump.ts`, `habits.ts`, `insights.ts`).
- 07/10 : `lib/engines/session-fatigue-baselines.ts` (fonctions de fatigue habituelle sorties du store, sans changement) + `fatigueContextAtExerciseStart`.
- 07/10 : `lib/engines/session-insights.ts` (`debriefSession`, `buildSessionInsights`, `recordTarget`, `historyBefore`), essayé sur les vraies séances (`npx tsx ../jeera-bilan-data/insights.ts ../jeera-bilan-data/alldata-2026-10-07.json 0,1`).

- 07/10 : tests (session-insights 12, exercise-records 3, habitual-session 7, store startHabitual 1) ; store `sessionDebrief` ; UI `BilanInsights` (feuille + Historique `SessionBilan`) ; fiche `ExerciseRecords` ; « Séance du jour » (`habitual-session.ts`, `defaultStartChoice`, `startHabitual`).
- 07/10 : captures iPhone dans `captures/bilan/` (serveur `jeera-bilan` port 3101 hors ligne, état injecté ; scripts `shot.mjs`, `prep-state.ts`, `steps-*.json` dans `../jeera-bilan-data`).

- 07/10 : CLAUDE.md (2 décisions + passation), rebase sur origin (PR #28 training-state), lint/tsc/810 tests verts ; captures en JPEG (3,7 Mo), secrets floutés ; historique de la branche réécrit en un commit (les PNG des premiers essais montraient des secrets).

## Reste à faire
- Ouvrir la PR, attendre la CI verte.

## Notes
- Captures : `node ../jeera-bilan-data/shot.mjs ../jeera-bilan-data/steps-replay.json` (rejeu de la séance du 06/10) et `steps-0710.json` (accueil, Historique, records). Secrets floutés (règle d'Evan).
- Quota au départ de la reprise : 5 h 4 %, semaine 8 %. Seuils d'arrêt : 5 h ≥ 85 %, semaine ≥ 35 %.
