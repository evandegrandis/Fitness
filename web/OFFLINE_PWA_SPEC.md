# Jeera — Offline PWA & suggestions hors-ligne — SPEC (Phase 4)

> But : suggestions intra-séance **complètes même hors-ligne, y compris après reload/cold-start**.
> Contraintes DURES d'Evan (critères d'acceptation, non négociables) :
>  (C1) **Fraîcheur du code** : une MAJ d'algo/code déployée NE DOIT JAMAIS rester bloquée derrière un
>       cache périmé. Réseau présent ⇒ toujours la version fraîche. Un nouveau SW s'active immédiatement.
>  (C2) **Base = source de vérité sécurisée** : localStorage n'est qu'un CACHE offline. Toute écriture
>       hors-ligne est mise en file (outbox) et re-synchronisée sur Neon dès le retour réseau. Jamais de
>       donnée qui ne vit QUE dans le cache.
> Convention : Next NON standard (`AGENTS.md`) → LIRE `node_modules/next/dist/docs/` (service worker /
> PWA / metadata) AVANT tout code. DB : lecture seule ici (pas de migration) ; host-gardé si jamais.

## 1. Service worker (C1 au centre)
> **Révision du 08/10/2026** (CLAUDE.md, « The app opens and changes tabs without waiting for the network ») : la coquille ne
> porte plus de données, elle est donc servie DU CACHE (versionné par build), plus en network-first ; C1 tient par la mise à
> jour du worker (nouveau `sw.js` à chaque build, activé aussitôt, rechargement dès qu'aucune saisie n'est en cours). Les
> segments d'onglets préchargés par le routeur sont gardés avec la coquille. Source : `lib/pwa/service-worker-source.ts`.
- Fichier SW servi à la racine (scope `/`). Enregistré côté client (petit composant `"use client"` monté dans le layout).
- **Stratégies de fetch** :
  - **Navigations HTML + assets JS/CSS (le CODE)** : **network-first**. En ligne → toujours le réseau (⇒ code frais, C1). Hors-ligne → repli sur le shell/asset caché.
  - Assets statiques immuables (hashés par le build) : cache-first OK (le hash change à chaque build ⇒ jamais périmé).
  - **Server actions / mutations / requêtes de données** : **jamais** mises en cache comme autorité (network-only ; l'offline lit le store, pas le SW).
- **Cycle de vie anti-périmé (C1)** : `self.skipWaiting()` + `clients.claim()` ; nom de cache **versionné par build** (ex. stamp injecté) ; à l'`activate`, **supprimer tous les caches d'une version antérieure**. Au retour en ligne, un nouveau SW prend la main immédiatement (pas d'attente de fermeture d'onglet). Prévoir un signal UI léger « nouvelle version dispo, rechargée » si besoin, mais l'auto-activation reste le défaut.
- Ne PAS précacher de données utilisateur dans le SW (elles vivent dans le store/localStorage, §2).

## 2. Cache offline des données de référence (C2)
- `partialize` (store `persist`) inclut désormais, EN PLUS de la séance active : `catalog`, `history`, `goals`, `settings`, `templates`, `recoveryCheckins`. **Uniquement un cache** — Neon reste la vérité (C2).
- `merge()` : revit les `Date` de `history` (dates de séance + `LoggedSet.timestamp`) et de `catalog` (`lastUsed`), comme `reviveSessionDates` le fait déjà pour la séance active. Sans ça, `.getTime()` casse au reload.
- **Fraîcheur des données** : à chaque chargement EN LIGNE, `StoreHydrator.hydrate(serverData)` **écrase** le cache persisté (données Neon fraîches). Hors-ligne, on garde le cache. Ordre garanti : `persist.rehydrate()` (cache) PUIS `hydrate(serverData)` quand dispo.

## 3. Hydratation résiliente hors-ligne
- Problème : `layout.tsx` est un composant SERVEUR (`force-dynamic`) qui appelle `getInitialData()` (Neon). Hors-ligne, il ne peut pas tourner → aujourd'hui l'app ne charge pas.
- Fix : (a) le SW sert le shell caché hors-ligne (§1) ; (b) `getInitialData()` rendu **offline-safe** (try/catch : si Neon injoignable, renvoyer `null`/vide et laisser le client hydrater depuis le cache localStorage) ; (c) `StoreHydrator` : si `data` est vide/nul, **ne pas écraser** le cache réhydraté (garder les valeurs offline). Résultat : cold-start hors-ligne → shell caché → hydratation depuis le cache → `suggestion()` complète.
- Invariant : quand `data` serveur est présent, il **prime** (C1/fraîcheur) ; quand absent (offline), le cache prend le relais.

## 4. Écritures hors-ligne → resync sécurisée (C2)
- Séances terminées : déjà en outbox (`lib/sync/outbox.ts`) + `flush(saveSession)` au retour réseau (`SyncProvider`). Conserver.
- **Étendre le filet** : les écritures aujourd'hui directes (settings `updateSettings`, édition d'exo `upsertExercise`, suppression) doivent, hors-ligne, être mises en file/rejouées plutôt que perdre l'action (au minimum : ne pas planter, et re-tenter au retour réseau). La base reste la destination finale (C2).
- Aucune donnée ne doit vivre uniquement dans le cache : tout ce qui est modifié offline est rejoué vers Neon.

## 5. Fix MOYEN (indépendant) — progression perso toujours visible
- `personalProgress` est aujourd'hui rendu DANS `BenchmarkGauge`, elle-même conditionnée à `hasBenchmark`. Donc un exo sans standard fiable (Ab roller debout, profil non supporté) n'affiche RIEN.
- Fix : afficher le bloc **progression perso** même quand `hasBenchmark === false` (dès qu'il y a un historique). La jauge StrengthLevel reste conditionnée à `hasBenchmark`, la progression perso non.

## 6. Vérification (obligatoire)
- `npx tsc --noEmit` clean + `npx vitest run` vert (dont un test : partialize inclut bien les nouvelles clés ; merge revit les dates de `history`).
- **Test C1 (fraîcheur) — à documenter dans la note** : simuler 2 builds ; après un nouveau build, un reload EN LIGNE sert le nouveau code (pas l'ancien cache) et purge les vieux caches.
- **Test offline** : après un chargement en ligne, passer hors-ligne, **recharger** → l'app charge (shell caché) ET `suggestion()` reste complète (catalog/history/settings présents, poids de corps 80, pas le fallback 20×10).
- Ne PAS déployer (le déploiement `vercel --prod` reste déclenché par Evan) ; fournir le plan de test manuel.

## 7. Lots (résumables — voir VARIATION_CYCLING_IMPL.md Phase 4)
- P4.1 — Persistance cache des données de référence (§2) + revive dates + StoreHydrator résilient (§3). (Zéro risque de périmé : pur client.)
- P4.2 — `getInitialData` offline-safe + hydratation de repli (§3).
- P4.3 — Service worker network-first + auto-update anti-périmé (§1) + enregistrement client + manifest. (LIRE les docs Next d'abord ; c'est le lot à blast radius — tester C1 à fond.)
- P4.4 — Filet outbox élargi aux écritures settings/édition d'exo (§4).
- P4.5 — Fix progression perso toujours visible (§5).
