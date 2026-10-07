# Journal du chantier ANIMATIONS (branche web/celebrations)

Worktree : `~/.local/share/barbis-dev/jeera-anim` (créé depuis `origin/web/nextjs-app`).
Règle : après chaque étape, ce journal est mis à jour, puis commit + push de la branche.

## Reprise après coupure
```
cd ~/.local/share/barbis-dev/jeera-anim
git fetch -q origin && git status -s && git log --oneline -5
cat JOURNAL-chantier.md            # lire « Reste à faire »
cd web && npm ci                    # si node_modules manque
# Aperçu des animations (aucune base de données) :
PORT=3102 DATABASE_URL= npx next dev -p 3102   # puis http://localhost:3102/dev/celebrations
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

## Reste à faire
1. ~~Moteur~~ fait.
2. Socle : store, registre, hôte, kit, route d'aperçu `/dev/celebrations`.
3. J3 : rang en séance (approche, passage B/A/S, encouragements), branché dans `SessionHeader`.
4. J1 : scènes de série S + affichage bilan et Progrès.
5. J2 : 24 scènes de secrets.
6. Captures iPhone (CDP), relecture visuelle, corrections.
7. CLAUDE.md (Key Decisions + HANDOFF), lint/tsc/tests, rebase, PR.
