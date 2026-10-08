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

## Reste
- [ ] Diagnostic mesuré (prod, 3G faible, hors ligne) : ouverture froide/chaude, onglets, création d'exercice, série
- [ ] Service worker : jamais d'échec de navigation, coquille en cache, page de repli
- [ ] Ouverture sans attendre le serveur (données hors du HTML), onglets sans aller-retour
- [ ] Création d'exercice locale, pas pendant la frappe, pas de « Création… » sans fin
- [ ] Erreurs rattrapées sans fermer l'app
- [ ] Vérifs : lint, tsc, test, mesures après, captures hors ligne
- [ ] CLAUDE.md (Key Decisions + HANDOFF), PR
