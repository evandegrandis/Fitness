# SPEC + PLAN — RIR, raison d'arrêt, finisher explicite (issu de oui.rtf / conversation GPT-5.6)

> Source : `/Users/evan/Desktop/oui.rtf` — discussion Evan × IA se terminant par 7 recommandations
> d'app + corrections de données. But de CE chantier : appliquer ce qui est applicable, **UX clean et
> rapide (pas de fenêtre bloquante)**, sans casser l'invariant moteur (pur, dérivé de l'historique ;
> aucun état dérivé persisté — ALGO_SPEC_HARDENED §0.2) ni les tests.

## Diagnostic sur pièces (code réel lu le 2026-08-17)
- `lib/models/enums.ts` : `SetType.finisher` EXISTE déjà. Auto-détection finisher = `shouldAutoMarkFinisher`
  (`lib/store/workout.ts:426`) — exige `reps >= max(15, repTargetMax)` → rate un HSPU ×10 réellement
  maximal (critique de l'IA, point #4). Reclassement silencieux confirmé (`logSet` force le type).
- `components/workout/EditSetSheet.tsx` : toggle **Finisher** déjà présent (édition a posteriori). Donc
  #4 est partiellement couvert ; il manque surtout de NE PAS reclasser en douce + capter le contexte.
- `components/workout/SetEntry.tsx` : bouton Valider → `onLogSet(...)`. Composant remonté à chaque set
  (donc PAS d'état pré-validation durable ici — le RIR doit être capté au log OU édité sur la ligne).
- `lib/db/schema.ts:220` `logged_sets` : stocke déjà le snapshot suggestion→réel (`suggested_*`,
  `predicted_reps_at_actual_weight`, `suggestion_engine_version`…). **Manque le RIR** pour interpréter
  l'écart (point #2 de l'IA). Aucune colonne RIR ni raison d'arrêt.
- `lib/engines/session-fatigue.ts` : « fatigue » ≈ nb de séries antérieures = PRÉ-fatigue estimée, pas
  détectée (point #6). Réduit chaque exo à un seul groupe principal.
- Données : « Tirage vertical muscle up » classé `vertical_pull`, GIF lat pulldown, benchmark proxy
  lat-pulldown, seul le chef long du triceps crédité (points data). Evan confirme : hybride à
  terminaison extension coude (triceps). Abdos : charge pile seule non comparable (metadata machine).

## Périmètre APPLIQUÉ maintenant (Phase 1) — sûr, testable, à haute valeur, UX clean
Décision UX (répond à « pop up ? » = NON bloquant) :
- **Écran de saisie épuré** : une seule bande RIR optionnelle dans `SetEntry`, au-dessus de Valider,
  chips `0 · 1 · 2 · 3 · 4+` — aucune présélection, tap unique, non demandé en échauffement. Valider
  sans choisir → `reportedRir=null` (zéro friction). Le RIR choisi part dans `onLogSet`.
- **Édition a posteriori** dans `EditSetSheet` (tap sur la ligne) : RIR + raison d'arrêt + finisher.
  → « facultatif, éditable ensuite, sans fenêtre bloquante » satisfait.
- **`SetRow`** affiche un suffixe discret `RIR n` / `arrêt: douleur` quand présent (visible + éditable).

### 1A — Données & plomberie (additif, nullable = migration NON destructive)
- `logged_sets` + `reported_rir` (integer nullable, check 0..4 ; 4 = « 4+ »),
  + `stop_reason` (text nullable, check in muscular|technique|pain|equipment).
- `enums.ts` : `StopReason` (muscular/technique/pain/equipment) + libellés FR ; helper RIR (0..4).
- `types.ts` `LoggedSet` : `reportedRir?: number|null; stopReason?: StopReason|null;`
- `mappers.ts` : map row↔domain (2 sens) ; `backup.ts` : (dé)sérialisation tolérante (null par défaut,
  hydrate les anciens caches/localStorage sans casse).
- store `logSet` input : `reportedRir?`, `stopReason?` → posés sur `newSet`. `editSet` : idem éditable.

### 1B — UI (clean, rapide)
- `SetEntry` : bande RIR optionnelle (chips), non-warmup uniquement. Passe `reportedRir` à `onLogSet`.
- `EditSetSheet` : ajoute sélecteur RIR (0·1·2·3·4+·—) + raison d'arrêt (aucune·muscu·technique·douleur
  ·matériel). Finisher déjà là.
- `SetRow` : suffixe discret RIR / raison d'arrêt.

### 1C — Consommation SÛRE (le plus fort rapport valeur/risque, avec tests)
- **Nerf ulnaire / point #7 & #2** : une série avec `stopReason ∈ {pain, equipment}` NE DOIT PAS
  entraîner le modèle de performance (exclue des baselines/records/anchors). Point d'ancrage : filtrer
  au niveau des collecteurs d'historique de perf. Ajouter tests de non-régression.
- Ne PAS reclasser silencieusement en finisher : `shouldAutoMarkFinisher` ne doit plus DÉGRADER —
  option retenue : conserver la détection mais uniquement comme SUGGESTION (ne pas changer le type
  sans intention). (À implémenter prudemment ; sinon, a minima, documenter + garder l'édition.)

## Périmètre DIFFÉRÉ (Phase 2) — plus invasif, nécessite maths moteur + regressions
- #2 complet : capacité estimée ≈ reps + RIR (RIR 0–3), apprentissage du biais perso par exo/machine/
  plage ; RIR 4+ = borne inférieure. Distinguer frais/pré-fatigue/superset/finisher dans la prévision.
- #3 : séparer « couverture règle 8 reps » (déjà `set-structure.ts:16`) du « stimulus estimé » (RIR).
- #6 : redéfinir la fatigue (sous-perfs concordantes à bas RIR sur ≥2 exos ; PR récent abaisse la
  proba ; calcul multi-muscles au lieu d'un seul groupe principal — `session-fatigue.ts:80`).
- #5 : phase limitante des mouvements hybrides (triceps·tirage·technique) mémorisée.
- Data : reclasser « Tirage vertical muscle up » (retirer benchmark externe, dominante triceps) ;
  metadata abdos (machine/réglage/amplitude). Touche benchmark + comptage volume → tests requis.

## Contraintes de process
- Next 16 NON standard : lire `node_modules/next/dist/docs/` avant tout code UI (fait : composants
  client `"use client"`, pas de nouveauté requise ici — on étend des composants existants).
- DB : migration additive nullable = sûre. NE PAS lancer seed/reset. `scripts/_safety.ts` garde les
  scripts destructifs. Générer la migration via drizzle-kit ; application = flux habituel d'Evan.
- Vérif obligatoire après chaque couche : `npx tsc --noEmit` + `npx vitest run`. NE PAS déployer.

## État d'avancement
- [x] Diagnostic + spec (ce fichier)
- [x] 1A données/plomberie — enums `StopReason`/RIR ; `logged_sets` +`reported_rir`+`stop_reason` ;
      types `LoggedSet` ; mappers (2 sens) ; backup zod+export+import ; store `logSet`/`editSet` ;
      migration `drizzle/0008_rir_stopreason.sql` + snapshot 0008 + journal (écrits à la main car
      toolchain drizzle-kit KO sur cette machine — voir note ci-dessous ; additif+idempotent, sûr).
- [x] 1B UI — bande RIR dans `SetEntry` (chips 0·1·2·3·4+, non-warmup, aucune présélection, 1 tap,
      non bloquante) ; `EditSetSheet` : RIR + raison d'arrêt (+ finisher déjà présent) ; `SetRow` :
      badges discrets RIR / raison d'arrêt (douleur/matériel en rose).
- [x] 1C consommation sûre — `records.ts::normalRecordSets` exclut les séries `stopReason ∈
      {pain,equipment}` (⇒ pas de record, pas d'ancre de perf via `buildRecords`, pas d'étoile) ;
      3 tests de non-régression ajoutés.
- [x] tsc --noEmit clean + vitest 429/429 verts.
- [ ] Récap à Evan (Phase 2 proposée, non implémentée) — voir « Périmètre DIFFÉRÉ » ci-dessus.

## Note toolchain (2026-08-17)
Le pop-up macOS répété « No se ha abierto fsevents.node » = Gatekeeper bloquait les binaires natifs
de `node_modules` (attribut `com.apple.quarantine` posé par `sharingd` → dossier transféré via
AirDrop/partage). Corrigé : `xattr -r -d com.apple.quarantine node_modules`. Cela a aussi réparé
tsx/vitest. `drizzle-kit generate` reste KO ici (mismatch esbuild host 0.25.12 vs binaire 0.28.1,
lié à Node 25) → migration 0008 écrite à la main dans le style idempotent du repo. Sur une machine
à toolchain saine, `npm run db:generate` régénérerait un équivalent ; la 0008 actuelle est
directement applicable (ADD COLUMN IF NOT EXISTS + checks gardés).

## Reste NON traité de #4 (honnête)
`shouldAutoMarkFinisher` (store) peut encore reclasser une série en finisher (≥15 reps + conditions).
Le contrôle finisher EXPLICITE existe (EditSetSheet) et le RIR distingue désormais frais/finisher,
mais la suppression du reclassement silencieux touche la logique records/superset + tests → différée
en Phase 2 avec regressions dédiées.
