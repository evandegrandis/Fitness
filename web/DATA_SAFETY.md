# Garde-fous de données

Écrit le 26/09/2026. Deux exigences d'Evan : **les données sont toujours sauvegardées en double
sur Cloudflare**, et **aucune PR ne peut effacer des données existantes**.

## L'incident qui les a déclenchées

Le 26/09 à 00:45, un Safari de l'iPhone resté sur son stockage local du 16/09 (le téléphone de
l'incident du 17/09, voir `SYNC.md`) a été rouvert. Sa file contenait encore une centaine
d'écritures décidées entre le 20/08 et le 16/09 ; il en a rejoué 39 en dix secondes (8 séances,
13 check-ins, 2 profils musculaires) avant qu'une coupure réseau l'arrête. Comparaison ligne à
ligne avec une branche Neon figée à 00:45:00 : contenu identique, rien de perdu, parce que ces
données avaient été récupérées le 17/09 depuis le même téléphone. Mais les 62 suivantes auraient
remis les objectifs, le poids des réglages et une fourchette de reps d'août. Aucune des PR
déployées ce soir-là n'avait touché à la synchro : le défaut datait du 17/09 (une écriture
rejouée écrasait toujours le serveur, quel que soit son âge).

## Ce qui protège désormais les données

1. **Seconde copie sur Cloudflare R2** (Barbis, `src/jeera-backup.ts`). Toutes les tables du
   schéma `public`, lues dans Neon par le rôle `barbis_backup` (SELECT seulement), sans passer
   par le code de Jeera : aucune PR de Jeera ne peut casser ni effacer cette copie. Au plus une
   par heure, plus une après chaque séance validée, écrite seulement si le contenu a changé,
   jamais supprimée. Bucket `barbis-backups`, clés `jeera/AAAA/MM/JJ/<horodatage>.json.gz`
   (`{ format: "jeera-neon-dump/1", taken_at, sha256, tables: { nom: [lignes] } }`). Alerte
   Telegram si aucune copie n'a réussi depuis 24 h. Neon ne garde que 6 h d'historique sur l'offre
   gratuite : au-delà, ces copies sont la seule mémoire.
2. **Journal des lignes (`row_history`)**, tenu par la base elle-même (trigger de contrainte
   différé `jeera_keep_row_history`, migration 0016). Toute ligne écrasée ou supprimée y garde
   son ancienne version 30 jours, quel que soit l'écrivain (app, Barbis, script, PR boguée). Une
   séance réenregistrée à l'identique n'y laisse rien. Purge déterministe tous les 1 000 ajouts.
3. **`TRUNCATE` refusé** sur toutes les tables de données (`jeera_refuse_truncate`).
4. **Une écriture rejouée n'écrase jamais plus récent** (`lib/db/stale-writes.ts`). Chaque
   écriture de la file porte l'heure où elle a été décidée (`intentAt`). Si la cible a changé
   sur le serveur après cette heure, au-delà de 10 min de tolérance d'horloge, ou a été supprimée
   après elle, l'écriture devient une lettre morte `stale_write` : « mise de côté », visible dans
   la bannière et dans Réglages → Synchronisation (« Tout abandonner »). `updated_at` est tenu
   par un trigger (`jeera_touch_updated_at`) : le code ne peut pas l'oublier. Les colonnes
   dénormalisées (`exercises.last_used`, `user_settings.body_weight_kg`) ne comptent pas comme
   une modification.
5. **Les PR sont contrôlées** (`lib/db/__tests__/data-safety.test.ts`, lancé par `npm test`,
   donc par les agents de Barbis et par la CI `.github/workflows/web-checks.yml`). Une migration
   postérieure à 0016 qui contient DROP, TRUNCATE, DELETE, UPDATE, un changement de type ou un
   trigger coupé échoue, sauf ligne `-- destructive-ok: <raison>` que seul Evan décide d'ajouter.
   Du code qui vide une table, coupe un trigger ou écrit dans `row_history` échoue aussi.

## Restaurer

- **Une ligne** : `SELECT * FROM row_history WHERE table_name = 'logged_sets' AND row_key = '<id>' ORDER BY changed_at DESC`,
  puis réinsérer `old_row` (`jsonb_populate_record`).
- **Un état complet** : dans les 6 h, créer une branche Neon à l'instant voulu (console, « Branch
  from a point in time »). Au-delà, lire une copie R2 (`GET /internal/r2/object?key=jeera/...`
  sur le Worker de Barbis, secret du Mac, ou `wrangler r2 object get barbis-backups/<clé> --remote`)
  et réinsérer les lignes voulues sur une branche d'abord, jamais directement en production.
