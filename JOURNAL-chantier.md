# Journal du chantier « rapide hors réseau » (08/10/2026)

Branche `web/rapide-hors-reseau` (worktree `~/.local/share/barbis-dev/jeera-perf`), base `origin/web/nextjs-app` af8d811.
Retiré du suivi au dernier commit.

## Reprise
1. Lire ce fichier, puis `git log --oneline origin/web/nextjs-app..HEAD`.
2. Quota : `mcp__ccd_session_mgmt__get_usage` (arrêt à 85 % sur 5 h ou 40 % semaine).
3. Mesures et scripts dans `perf/` (scratch hors dépôt : `~/.local/share/barbis-dev/jeera-perf-data/`).

## Fait
- [x] Worktree + npm ci ; lecture CLAUDE.md, SYNC.md, DATA_SAFETY.md, OFFLINE_PWA_SPEC.md (08/10 ~09:00)
- Quota au départ : 5 h 17 %, semaine 22 %.
- [x] Correction de données APPLIQUÉE en prod (08/10 08:56 UTC) : « Trac » (0 série) renommé « Traction largeur épaule », profil donneur = Traction pronation large (le mécanisme sur tout le catalogue choisissait HSPU à cause du mot « épaule » : restreint aux tractions), réglages du donneur ; logged_exercises 68f9e40c (01/10) et 4d1872d3 (06/10) rattachés ; séances touchées (updated_at). Étoiles : 104 avant = 104 après, aucune sur les tractions. Annulation : `jeera-perf-data/rollback-traction.sql`. row_history : exercises 1, logged_exercises 2, muscle_mappings 12.
- Mesures prod (avant) : HTML 983 Ko brut / 101 Ko br sur CHAQUE page (tout le jeu de données dedans), TTFB froid 3,2 s (fonction iad1 + Neon us-east-1), chaud 0,43 s ; JS initial 447 Ko br (1,4 Mo brut, 20 fichiers).

- [x] Code (commit « Ouverture sans réseau ») : coquille statique sans données + GET /api/data en arrière-plan (StoreHydrator), SW refait (lib/pwa/service-worker-source.ts : coquille du cache, repli FR, jamais de rejet), autosave et création d'exercice en file locale (queueWrite), délai 45 s par opération de rejeu, revalidatePath retirés des Server Actions (vidaient le cache du routeur), staleTimes.static 7 j, error.tsx + global-error.tsx en français, garde de création (create-exercise-guard.ts), loading.tsx du détail de séance. Tests : outbox (délai), garde, service worker (6).
- Causes trouvées : HTML de 983 Ko par page ; Server Actions sérialisées dans la file du routeur Next + revalidatePath qui renvoie tout l'arbre (1 Mo) et vide le cache du routeur ; SW network-first qui attend les en-têtes puis laisse le corps traîner (écran noir) et rejette sans cache (erreur Safari) ; « Création… » attendait la Server Action sans délai.

## Reste
- [ ] Mesures avant (prod, slow3g) : `jeera-perf-data/measure.mjs` → avant-prod-slow3g.json (en cours)
- [ ] Mesures après : next build + next start local (lecture seule ou état injecté), même script
- [ ] Création d'exercice et série : mesurer (local)
- [ ] Vérifs : lint, tsc, test, mesures après, captures hors ligne
- [ ] CLAUDE.md (Key Decisions + HANDOFF), PR
