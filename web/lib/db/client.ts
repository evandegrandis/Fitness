/**
 * Client Drizzle sur Neon serverless (HTTP driver — pas de pool persistant,
 * adapté aux fonctions serverless Next.js).
 *
 * `DATABASE_URL` peut être absent en local (ex: avant provisioning Vercel/Neon,
 * ou pendant `tsc --noEmit` / tests unitaires qui n'ont pas besoin de DB) : on
 * initialise le client de façon paresseuse (lazy) et on ne lève une erreur
 * qu'au premier accès réel à `db`, jamais à l'import du module.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createDb(): ReturnType<typeof drizzle<typeof schema>> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL n'est pas défini — impossible d'initialiser le client Drizzle/Neon."
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

/**
 * Proxy paresseux : `createDb()` n'est appelé qu'au premier accès à une
 * propriété de `db`, pas à l'import du module. Permet d'importer ce fichier
 * (et tout ce qui en dépend) même quand `DATABASE_URL` n'est pas encore
 * configuré, tant que le code n'exécute pas de requête.
 */
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      if (!cachedDb) {
        cachedDb = createDb();
      }
      return Reflect.get(cachedDb as object, prop, receiver);
    },
  }
);
