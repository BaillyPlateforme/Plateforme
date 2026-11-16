/*
 * Une session Supabase ouverte comme le fait le navigateur (même bibliothèque
 * @supabase/ssr, mêmes cookies), pour qu'un test d'API ou de navigateur entre
 * avec un compte sans repasser par l'écran de connexion. L'écran lui-même est
 * testé à part (parcours/connexions.spec.ts).
 */
import path from "node:path";
import { createRequire } from "node:module";
import { RACINE } from "./config.mjs";

const exiger = createRequire(path.join(RACINE, "package.json"));
const { createServerClient } = exiger("@supabase/ssr");

/** Les cookies d'une session ouverte avec un e-mail et un mot de passe. */
export async function cookiesDeSession({ url, anon }, email, motDePasse) {
  const pot = new Map();
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...pot].map(([name, value]) => ({ name, value })),
      setAll: (liste) => {
        for (const { name, value } of liste) value ? pot.set(name, value) : pot.delete(name);
      },
    },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`Connexion de ${email} impossible : ${error.message}`);
  return [...pot].map(([name, value]) => ({ name, value }));
}

export const enTeteCookie = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join("; ");

/** Le même jeu de cookies, au format storageState de Playwright, pour chacune des origines. */
export function etatNavigateur(cookies, origines) {
  return {
    cookies: origines.flatMap((o) => {
      const u = new URL(o);
      return cookies.map((c) => ({ name: c.name, value: c.value, domain: u.hostname, path: "/", expires: -1, httpOnly: false, secure: u.protocol === "https:", sameSite: "Lax" }));
    }),
    origins: [],
  };
}
