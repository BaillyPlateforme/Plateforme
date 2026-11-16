/*
 * L'inventaire des routes et des pages, lu dans le code à chaque passage :
 * une route ajoutée demain est testée sans toucher à la batterie.
 */
import fs from "node:fs";
import path from "node:path";
import { RACINE } from "./config.mjs";

export const UUID_FAUX = "00000000-0000-4000-8000-000000000000";

function fichiers(dossier: string, nom: string): string[] {
  if (!fs.existsSync(dossier)) return [];
  const sortie: string[] = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...fichiers(p, nom));
    else if (e.name === nom) sortie.push(p);
  }
  return sortie;
}

/** « app/(interne)/api/x/[id]/route.ts » → « /api/x/<uuid> » (groupes retirés, segments remplis). */
export function versChemin(fichier: string, app: "externe" | "interne", remplir: (segment: string) => string = () => UUID_FAUX): string {
  const base = path.join(RACINE, "apps", app, "src", "app");
  const segments = path
    .relative(base, path.dirname(fichier))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"))
    .map((s) => {
      if (/^\[\[\.\.\..+\]\]$/.test(s)) return remplir(s);
      if (/^\[\.\.\..+\]$/.test(s)) return remplir(s);
      if (/^\[.+\]$/.test(s)) return remplir(s);
      return s;
    })
    .filter(Boolean);
  return "/" + segments.join("/");
}

export type Route = { app: "externe" | "interne"; fichier: string; chemin: string; methodes: string[] };

export function routes(app: "externe" | "interne"): Route[] {
  return fichiers(path.join(RACINE, "apps", app, "src", "app"), "route.ts")
    .map((f) => {
      const src = fs.readFileSync(f, "utf8");
      const methodes = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      return { app, fichier: path.relative(RACINE, f), chemin: versChemin(f, app), methodes: [...new Set(methodes)] };
    })
    .sort((a, b) => a.chemin.localeCompare(b.chemin));
}

export type Page = { app: "externe" | "interne"; fichier: string; modele: string; dynamique: boolean };

/** Les pages, avec leur modèle d'adresse (« /clients/[id] ») : le remplissage des segments se fait au test. */
export function pages(app: "externe" | "interne"): Page[] {
  const base = path.join(RACINE, "apps", app, "src", "app");
  return fichiers(base, "page.tsx")
    .map((f) => {
      const modele =
        "/" +
        path
          .relative(base, path.dirname(f))
          .split(path.sep)
          .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"))
          .join("/");
      return { app, fichier: path.relative(RACINE, f), modele: modele === "/" ? "/" : modele.replace(/\/$/, ""), dynamique: /\[/.test(modele) };
    })
    .sort((a, b) => a.modele.localeCompare(b.modele));
}

/** Remplit un modèle d'adresse avec des valeurs données par segment (« [id] » → « 12 ») ; null si un segment manque. */
export function remplir(modele: string, valeurs: Record<string, string | undefined>): string | null {
  let manque = false;
  const chemin = modele.replace(/\[\[?(?:\.\.\.)?([^\]]+)\]?\]/g, (tout, nom) => {
    const v = valeurs[tout] ?? valeurs[nom];
    if (v === undefined) {
      if (tout.startsWith("[[")) return "";
      manque = true;
      return "";
    }
    return encodeURIComponent(v);
  });
  return manque ? null : chemin.replace(/\/+$/, "") || "/";
}
