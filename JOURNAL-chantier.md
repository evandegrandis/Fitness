# Journal du chantier ANIMATIONS (branche web/celebrations)

Worktree : `~/.local/share/barbis-dev/jeera-anim` (créé depuis `origin/web/nextjs-app`).
Règle : après chaque étape, ce journal est mis à jour, puis commit + push de la branche.

## Reprise après coupure
```
cd ~/.local/share/barbis-dev/jeera-anim
git fetch -q origin && git status -s && git log --oneline -5
cat JOURNAL-chantier.md            # lire « Reste à faire »
cd web && npm ci                    # si node_modules manque
# Aperçu des animations (aucune base de données) : config « jeera-anim » de ~/.claude/launch.json
# (DATABASE_URL vide, port 3102), puis http://localhost:3102/dev/celebrations
./captures/j3.sh                    # captures du rang en séance (FORCE=1 pour refaire)
```
Captures : `captures/celebrations/` (rang, série S, encouragements ; versionnées).
Captures des secrets : HORS dépôt, `~/.local/share/barbis-dev/jeera-anim-secrets/` (règle d'Evan : rien qui les montre dans la PR).

## Décisions
- Dossier `web/components/celebrations/` : `store.ts` (file d'événements), `registry.tsx` (événement → mise en scène), `CelebrationHost.tsx` (monté une fois dans le layout), `kit.tsx` (primitives), `scenes/rank|streak|secrets`, `toasts/`.
- Série S : calculée dans `career.ts` (champ `sStreak` par séance, `career.sStreak` courant et record). Une séance sans rang (aucune série, cardio seule) ne casse ni n'allonge la série.
- Paliers de mise en scène : 2, 3, 4, 5, 7, 10, 15, 20, 25 conçus un par un ; au-delà, scène procédurale qui varie selon le compte ; incréments hors palier (6, 8, 9, 11…) : scène « maillon » dont la chaîne grandit.
- Rien ne bloque la saisie en séance : couches `pointer-events: none`, effacement automatique ; les secrets et la série (dans le bilan) se ferment seuls ou d'un tap.
- Aucune règle de rang modifiée : seulement lue (`nextRankPlan`, `rankScore`, `sessionGame`).

## Fait
- Étape 1 : `sStreak` dans `career.ts` (par séance + courant/record), test `career-s-streak.test.ts` vert.
- Étape 2 (socle) : `store.ts`, `registry.tsx`, `CelebrationHost.tsx` (monté dans `app/(app)/layout.tsx`, attend la fin des écrans de record/niveau), `kit.tsx`, aperçu `/dev/celebrations` (`?play=…`, `?secrets=1`).
- Étape 3 (J3) : `session-cues.ts` (+ test), `LiveRankRow.tsx` (jauge d'approche à crans, sortie de `SessionHeader`, branchée par `useSessionCelebrations`), scènes `rank/RankUpB|A|S`, bandeaux `NearRankToast`, `BeatenToast` (lueur du haut d'écran).
- Étape 4 (J1) : scènes `scenes/streak/` (2 doublé, 3 piliers, 4 forge, 5 laurier, 7 Grande Ourse, 10 Olympe, 15 éclipse, 20 foudre, 25 nova, maillon entre paliers, légende au-delà de 25), `BilanCelebrations.tsx` (bandeau de série + déclenchement série/secrets, branché en UNE ligne dans `PostWorkoutSheet.tsx`), `StreakSCard.tsx` (Progrès › Semaine, après Jalons), « Revoir » dans la carte Secrets. Captures `captures/j1.sh`.
- Étape 5 (J2) : 24 scènes `scenes/secrets/<id>.tsx` (cadre commun `stage.tsx`), registre `scenes/secrets/index.ts`, test `registry.test.ts` (chaque secret a sa scène). Captures HORS dépôt par `captures/j2.sh`.
- CLAUDE.md : ligne Key Decisions + HANDOFF du 07/10.
- Captures : `captures/shoot.mjs` (Chrome sans interface, temps virtuel, WAAPI retiré pour que framer-motion suive l'horloge virtuelle ; MP4 30 i/s + planche), `captures/j3.sh` (reprenable). Résultats dans `captures/celebrations/`.

## Reste à faire
1. ~~Moteur~~ fait.
2. ~~Socle~~ fait.
3. ~~J3~~ fait (à recapturer à la fin : bandeaux après `mode="wait"`).
4. ~~J1~~ fait (recapturer serie-4 après la correction du marteau).
5. ~~J2~~ fait, captures relues (24), retouches faites et recapturées.
6. ~~Captures~~ faites : `captures/celebrations/` (rang, bandeaux, simulateur, série, bilan, Progrès) ; secrets hors dépôt.
7. ~~CLAUDE.md, lint/tsc/tests, rebase sur origin/web/nextjs-app (#28, #29 ; conflit CLAUDE.md résolu en gardant les deux)~~ fait ; PR ouverte.

## Reste possible (hors périmètre ou à voir avec Evan)
- Vérifier sur l'iPhone d'Evan après déploiement (fluidité réelle, lisibilité en salle).
- Retirer `captures/` et ce journal avant fusion si on ne veut pas les garder dans le dépôt.
