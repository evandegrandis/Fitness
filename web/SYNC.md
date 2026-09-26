# Synchronisation téléphone → Neon : contrat

Écrit le 17/09/2026 après un mois de séances restées sur le téléphone.

## Ce qui s'est passé

Du 20/08 au 17/09/2026, une séance en tête de l'outbox référençait un exercice
créé hors-ligne (« Upper back ») que Neon ne connaissait pas. `saveSession`
échouait sur la clé étrangère `logged_exercises.exercise_id`, la file étant
causale elle s'arrêtait là, et le client, qui ne reçoit d'une Server Action
qu'une exception masquée, ne pouvait pas distinguer ce refus définitif d'une
coupure réseau. Résultat : 16 séances, 9 exercices, 29 check-ins et une pesée
bloqués, rejoués toutes les 30 s, avec pour seul signal un badge dans
l'en-tête de séance active. Les données ont été récupérées depuis l'export
JSON du téléphone (`scripts/recover-from-backup-2026-09-17.ts`).

## Les trois garanties

1. **Une séance s'écrit seule.** `syncSession` reçoit la séance ET les fiches
   des exercices qu'elle référence (lues dans le catalogue local au moment du
   rejeu). Les exercices inconnus du serveur sont créés dans le même lot
   atomique ; un exercice connu n'est jamais réécrit. Plus aucune dépendance
   à l'ordre exercice → séance dans la file. (`lib/db/session-writes.ts`,
   `lib/db/sync-actions.ts`, `lib/sync/session-dependencies.ts`)
2. **Le serveur répond par un résultat typé, jamais par une exception masquée.**
   `SyncOutcome = { ok } | { ok: false, kind: "transient" | "permanent", code, message }`.
   Permanent = SQLSTATE 22/23/42 ou `PermanentMutationError` ; tout le reste
   est transitoire. Chaque refus est journalisé côté serveur
   (`sync_op_rejected`), lisible dans les logs Vercel. (`lib/sync/outcome.ts`)
3. **Un refus permanent ne bloque plus rien et n'est jamais silencieux.**
   L'entrée quitte la file vers `jeera_sync_deadletter_v1` (localStorage) avec
   sa raison ; la file continue. Un échec transitoire garde l'ordre causal et
   note tentative + erreur. Bannière globale (`SyncAlertBanner`) dès qu'une
   écriture est refusée ou attend plus de 2 min ; Réglages → Synchronisation
   liste les refus avec « Réessayer » / « Abandonner ». Aucune donnée n'est
   jetée sans décision explicite. (`lib/sync/outbox.ts`)

En amont, Barbis (le second cerveau) lit Neon et alerte sur Telegram si plus
rien n'y arrive pendant 7 jours : la panne ne peut plus durer un mois sans que
quelqu'un le remarque.

4. **Une écriture rejouée n'écrase jamais une version plus récente du serveur**
   (26/09/2026). Chaque entrée porte l'heure de sa décision (`intentAt`) ; si la
   cible a changé ou a été supprimée sur le serveur depuis, l'entrée devient une
   lettre morte `stale_write` « mise de côté ». Voir `DATA_SAFETY.md`, qui décrit
   aussi la seconde copie sur Cloudflare R2 et le journal `row_history`.

## Poids : balance connectée → Jeera sans saisie

`POST /api/body-weight` (jeton `BODY_WEIGHT_INGEST_TOKEN`, variable Vercel ;
copie dans le trousseau macOS `jeera-body-weight-token`) :

```json
{ "weightKg": 75.3, "measuredOn": "2026-09-17T07:40:00+02:00", "source": "shortcut" }
```

Une pesée par jour civil, la dernière corrige ; `user_settings.body_weight_kg`
suit. Deux producteurs :

- **Barbis** : « je pèse 75,3 » en vocal → le coach nutrition envoie la pesée.
- **Raccourcis iOS** (VitaFit → Apple Santé → automatisation). Santé n'est pas
  un déclencheur d'automatisation dans Raccourcis, seulement une source
  d'actions : l'automatisation est donc **horaire** (ex. 09:30 et 21:00), et le
  raccourci envoie la pesée du jour si Santé en a une. Idempotent : le serveur
  garde une pesée par jour. Raccourci « Poids → Jeera » :
  1. *Rechercher des échantillons de santé* : Type = Poids, filtre « Date de
     début est aujourd'hui », trier par Date de début, Le plus récent en
     premier, Limite 1.
  2. *Si* « Échantillons de santé » a une valeur.
  3. *Formater la date* : Date de début de l'échantillon, format personnalisé
     `yyyy-MM-dd`.
  4. *Obtenir le contenu de l'URL* : POST `https://jeera-gamma.vercel.app/api/body-weight`,
     en-têtes `Authorization: Bearer <jeton>` et `Content-Type: application/json`,
     corps JSON : `weightKg` = Valeur de l'échantillon (nombre ou texte, virgule
     acceptée), `measuredOn` = date formatée, `source` = `shortcut`.
  5. Automatisation personnelle → Heure de la journée → Quotidien → Exécuter
     immédiatement → ce raccourci.

## Scripts d'exploitation

- `scripts/apply-known-muscle-profiles.ts` : pose les profils musculaires
  connus sur tout exercice sans mapping (dry-run ; `--apply` +
  `APPLY_PROD_MIGRATION`). À relancer après l'ajout d'un profil dans
  `lib/data/catalog-muscle-profiles.ts`.
- `scripts/recover-from-backup-2026-09-17.ts` : import additif depuis un
  export JSON du téléphone (ids absents seulement).

## Pas et énergie active : Apple Santé → Jeera

`POST /api/daily-activity` (même jeton), **un seul envoi par exécution** :

```json
{ "metric": "steps", "source": "shortcut", "lines": "17 sept. 2026 à 08:00 | 1 234 pas\n17 sept. 2026 à 09:00 | 2 100 pas" }
```

Une ligne par échantillon Santé (`<date> | <valeur>`), formats français
acceptés. Granularité détectée : tous à minuit → totaux journaliers ; sinon
détail horaire. Le mode « une requête par échantillon » (`steps` +
`measuredOn`) passe par la même ingestion. Stockage : `activity_hourly` ne
garde que les deux derniers jours (le détail d'aujourd'hui sert au coach le
soir), `daily_activity` garde un total par jour, recalculé depuis le détail
mais **jamais abaissé** (`greatest`) : une fenêtre horaire qui commence au
milieu d'un jour ne peut pas écraser le total importé de ce jour. Barbis lit les deux
(« aujourd'hui jusqu'à 20:00 : 18 400 pas »).

Raccourci « Pas → Jeera » (une requête, quel que soit le volume) :
1. *Rechercher des échantillons de Santé* : Type = Pas, Date de début est dans
   les derniers 2 jours, **Grouper par = Heure**.
2. *Répéter avec chaque élément* → dedans : *Texte* = `Élément répété › Date de
   début` ` | ` `Élément répété` ; puis *Ajouter à une variable* `lignes`.
3. Après la boucle : *Combiner le texte* (`lignes`, Nouvelles lignes).
4. *Obtenir le contenu de l'URL* POST, JSON : `lines` = Texte combiné,
   `metric` = `steps`, `source` = `shortcut`.
5. Automatisation quotidienne le soir (23:30) et, pour le cas « je rentre à 20 h,
   j'ai beaucoup marché », un lancement manuel ou une seconde automatisation
   à 19:30.

Import initial (9 mois) : même raccourci, une fois, avec Date de début dans les
derniers 270 jours et **Grouper par = Jour**, puis remettre 2 jours / Heure.
Même recette pour « Énergie active » avec `metric` = `active_energy`.
