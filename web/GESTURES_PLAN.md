# Jeera — Plan final clics → gestes (post contre-audit)

Date : 2026-07-17 · Lead UX : Claude · Statut : prêt à implémenter

## Ce qui a changé suite au contre-audit

Le contre-audit a été vérifié ligne par ligne contre le code : ses constats factuels sont exacts
(cartes toutes dépliées par défaut `ExerciseCard.tsx:63`, vrai nom d'état `armedSupersetExerciseId`
`workout.ts:116`, `navigator.vibrate` inopérant sur Safari iOS/PWA, et — non relevé par les deux
parties — **la suppression d'un set existe DÉJÀ au tap** dans `EditSetSheet.tsx:56-62`).

**Accepté (4 corrections majeures) :**
1. **P0 pager horizontal RETIRÉ, remplacé par l'accordéon.** La douleur de navigation est
   structurelle (liste de 2000px+ car tout est déplié), pas gestuelle. Une carte active dépliée +
   résumés compacts tappables bat le swipe : moins de scroll, zéro nouveau conflit d'axe, et ça
   isole le scrub sur la carte focus. On garde du pager sa seule bonne partie : le retrait du
   SwipeRow niveau carte (Dupliquer/Supprimer → ExerciseActionsSheet).
2. **Scrub recablé en 100 % visuel.** vibrate() devient un enhancement opportuniste (try/catch,
   no-op iOS). Canal primaire : graduation qui défile + snap du chiffre. Zone morte de 12px pour
   que le scroll natif gagne les gestes rapides. Affordance **persistante** (chevrons ‹›
   verticaux fantômes sous le chiffre), pas un tuto one-shot. L'argument "grands sauts" est
   abandonné : le scrub sert les ajustements ±1 à ±10, l'appui-maintenu ×8 reste la voie des
   grands écarts.
3. **P2 swipe-delete sur SetRow ÉCARTÉ.** Rare + destructif + arène de gestes imbriquée = jamais
   un geste. D'autant que le bouton Supprimer existe déjà dans EditSetSheet — le P2 initial
   réinventait une feature existante. Reste : ajouter l'undo toast sur cette suppression.
4. **+30s repos : bouton visible d'abord, geste en bonus.** Une capacité inédite gesture-only
   sans fallback violait notre propre règle.

**Défendu (2 points maintenus) :**
1. **Le scrub reste LE P0.** Le contre-audit le confirme : c'est le seul geste qui attaque le
   plus gros gisement (~20 ajustements/séance). Les correctifs le rendent fiable, ils ne le
   dégradent pas.
2. **Superset armé plein-carte maintenu tel quel** (nom d'état corrigé). Ce n'est pas un geste,
   c'est un agrandissement de cible de tap 32px → ~340×80px — exactement le genre de gain
   fiable qu'on veut. Le conflit "armé vs autres interactions" est tranché : l'état armé est
   modal et **prioritaire**, il court-circuite tout autre handler de la carte candidate.

**Règle gravée** : un geste ne se justifie que pour une action FRÉQUENTE et NON destructive,
avec une affordance persistante et un fallback bouton. Tout le reste est un tap à cible généreuse.

---

## Tableau des changements

| # | Prio | Titre | Geste / interaction | Remplace | Effort |
|---|------|-------|---------------------|----------|--------|
| 1 | P0 | Accordéon : une carte active, résumés compacts | Tap sur résumé = déplie (et replie l'autre) ; valider le dernier set planifié auto-avance à la carte suivante | Scroll de 2000px+ et recherche visuelle à chaque changement d'exercice (6-8×/séance + rounds de superset) → 1 tap ou 0 interaction | L |
| 2 | P0 | Scrub vertical sur le chiffre du Stepper | Glisser haut/bas sur le chiffre : 1 cran/18px après zone morte de 12px, feedback visuel (graduation + snap), vibrate opportuniste | ~20 ajustements/séance ; +10kg = 4 taps ou ~950ms d'appui-maintenu → un glissé de ~0.3s | M |
| 3 | P1 | RestTimer : swipe-up = passer, bouton +30s | Flick vers le haut n'importe où sur la carte du timer = skip ; bouton +30s visible ; swipe-down = +30s en bonus | Viser un bouton de 36px en périphérie → toute la carte (~340×76px) ; +30s n'existait pas | S |
| 4 | P1 | Superset armé plein-carte | Tap 1 sur Link2 (inchangé) ; en mode armé, tap N'IMPORTE OÙ sur une carte candidate = lier (halo pulsant, modal prioritaire) | Tap 2 passe d'une cible 32px cachée à toute la carte | S |
| 5 | P2 | Undo sur suppression de set | Aucun geste : le bouton Supprimer d'EditSetSheet existe déjà ; on ajoute snapshot + UndoToast | Suppression irréversible → récupérable en 1 tap | S |

---

## Détail d'implémentation

### 1. P0 — Accordéon + retrait du SwipeRow niveau carte (L)
- **ExerciseList/ExerciseCard** : `expanded` remonte au parent (`activeCardId` dans le store ou
  état local d'ActiveSession). Défaut : premier exercice sans set complété. Carte compacte =
  en-tête (nom, X/Y sets, badge PR, chip superset) ~64px, tappable partout.
- **Auto-avance** : à la validation du set qui atteint `plannedSets`, replier la carte et déplier
  la suivante non terminée + `scrollIntoView({behavior:'smooth', block:'start'})`. Pour les
  supersets : l'ordre suit `memberOrder` du round.
- **Retrait SwipeRow** : supprimer le wrapper `ExerciseCard.tsx:99-208` ; ajouter Dupliquer et
  Supprimer comme `ActionRow` dans `ExerciseActionsSheet.tsx` (qui n'a plus que "Remplacer") ;
  l'undo/snapshot existant de la suppression d'exercice est réutilisé tel quel. Coût : ces
  actions rares passent de swipe+tap à 2 taps — assumé.
- **Conflits** : aucun geste ajouté. Le drag ⋮⋮ (poignée isolée, `onPointerDownCapture`) et le
  scroll natif sont inchangés. Garder `SwipeRow.tsx` comme composant (inutilisé, ne pas supprimer).

### 2. P0 — Scrub vertical Stepper (M)
- **Stepper.tsx:93** : remplacer le `<span>` valeur par un élément à pointer handlers bruts
  (`onPointerDown` + `setPointerCapture`, `onPointerMove` accumule `deltaY`, `onPointerUp`
  libère). `touch-action:none` + `user-select:none` sur cette zone SEULE (~56px de large).
- **Zone morte 12px** avant le premier cran : un flick de scroll rapide traverse la zone sans
  déclencher (le scroll natif du reste de la page reste roi ; avec l'accordéon, un seul stepper
  visible à la fois → surface de collision minimale). Ensuite 1 cran par 18px, accélération ×4
  au-delà de 120px d'amplitude.
- **Feedback 100 % visuel** : mini-graduation verticale (3 ticks) qui défile à côté du chiffre +
  micro-scale du chiffre à chaque cran. `try { navigator.vibrate?.(5) } catch {}` en bonus
  Android, jamais comme mécanique.
- **Affordance persistante** : chevrons ˄˅ fantômes (opacity .3) au-dessus/dessous du chiffre,
  toujours visibles — pas de tuto one-shot (aucun système first-run n'existe).
- **Fallback intact** : boutons ± et appui-maintenu inchangés (les grands écarts passent par
  l'accélération ×8 existante, `Stepper.tsx:45`).
- **Conflits** : boutons ± capturent déjà leur pointeur (`:74-81`) ; aucun geste horizontal sur
  cette zone ; le seul risque (voler le scroll) est traité par zone morte + petitesse de la zone.

### 3. P1 — RestTimer swipe-up = skip, +30s au tap (S)
- `RestTimer.tsx:56` est déjà un `motion.div` : `drag="y"`, `dragConstraints={{top:-50,bottom:50}}`,
  `dragElastic=0.4`, `dragSnapToOrigin`, `onDragEnd` → `offset.y < -40 || velocity.y < -500` ?
  skip : `offset.y > 40` ? +30s.
- **Bouton +30s visible** (petit, mono, "+30") à côté du bouton skip — le geste down n'est qu'un
  raccourci d'une capacité qui existe au tap. Nouvelle action store `addRestSeconds(30)` dans
  `workout.ts` (décale `startedAtMs` ou augmente `targetSeconds`).
- **Affordance** : chevron ˄ discret en haut de la carte pour le skip (le +30 a son bouton, pas
  besoin d'affordance gestuelle).
- **Conflits** : zone `fixed z-40` hors flux (`RestTimer.tsx:61`), aucun enfant swipeable, axe
  vertical sans concurrent ; framer-motion distingue nativement tap et drag donc les onClick
  des boutons survivent.

### 4. P1 — Superset armé plein-carte (S)
- État réel : `armedSupersetExerciseId` (`workout.ts:116`, actions `:871` et `:875-880`) —
  `handleSupersetLink` gère déjà arm/link, on ne touche pas au store.
- `ExerciseCard.tsx` : si `armedSupersetExerciseId != null` et carte candidate → `onClickCapture`
  à la racine appelle `handleSupersetLink(id)` et `stopPropagation` ; style `ring-2 ring-[--accent]`
  + pulse framer-motion. `SupersetLinkBanner.tsx` inchangé (annulation).
- **Modal prioritaire** : pendant l'armement, la carte candidate ne fait QUE lier — expand,
  EditSetSheet, steppers désactivés par le capture ; pas de coexistence, pas d'ambiguïté.
  (Le conflit "armé vs pager" du contre-audit disparaît de lui-même : plus de pager.)

### 5. P2 — Undo sur suppression de set (S)
- `EditSetSheet.tsx:56` appelle déjà `deleteSet` : ajouter un snapshot avant suppression +
  `UndoToast` (même mécanique que la suppression d'exercice, `workout.ts:823-836`).
- Aucun geste : rare + destructif = tap à cible généreuse, conformément à la règle.

---

## Gestes écartés (et pourquoi — ne pas rouvrir sans nouveau signal)

- **Pager horizontal sur les cartes** : modèle mental faux (liste dépliée, pas un pager) ;
  l'accordéon résout la cause. Réévaluable seulement si, après accordéon, la navigation reste
  douloureuse.
- **Swipe-delete sur SetRow** : rare + destructif + arène imbriquée ; le tap existe déjà.
- **Drop-to-link superset** : indiscernable du drag de réordonnancement sur la même poignée.
- **Long-press en-tête** : conflit de timing avec le tap expand ; bug historique iOS non résolu.
- **Double-tap** : 300ms de latence de désambiguïsation sur chaque tap simple — inacceptable
  sur Valider.
- **Multi-doigts / pinch** : une main tient l'haltère.
- **+30s gesture-only** : capacité invisible sans bouton = morte-née.

## Ordre de livraison
1. Accordéon + retrait SwipeRow (P0 #1) — structurel, débloque le reste
2. Scrub Stepper (P0 #2) — vérifier sur device iOS réel (screenshot navigateur obligatoire)
3. RestTimer (P1 #3) puis Superset armé (P1 #4) — indépendants, petits
4. Undo set (P2 #5)
