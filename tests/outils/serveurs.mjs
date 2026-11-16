/*
 * Les deux apps lancées sur ce poste pour la batterie (CIBLE=local).
 *
 * Elles tournent en mode production (`next build` puis `next start`), sur la
 * base de RECETTE, avec des réglages qui ne laissent rien sortir :
 *   - ENVOI_MODE=desactive : aucun e-mail ni SMS ne part, tout est journalisé ;
 *   - CREAGIDEM_MODE=inactif, et aucun accès Créagidem (ils ne sont que dans
 *     « Clés », jamais lus ici) : la fiche est préparée, jamais envoyée ;
 *   - clés Brevo et Gemini remplacées par une valeur invalide : même un appel
 *     imprévu serait refusé par le service (Gemini se rallume avec AVEC_GEMINI=1) ;
 *   - des secrets tirés au hasard pour CE passage (n8n, tâches, SMS, Brevo,
 *     diagnostic) : la batterie peut vérifier qu'une route refuse sans eux et
 *     répond avec eux.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CIBLES, ETAT, PORTS, RACINE } from "./config.mjs";

const COUPEE = "coupee-par-la-batterie";

export function secrets() {
  const f = path.join(ETAT, "secrets.json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  fs.mkdirSync(ETAT, { recursive: true });
  const s = Object.fromEntries(["emails", "diagnostic", "taches", "sms", "brevo"].map((k) => [k, randomBytes(24).toString("base64url")]));
  fs.writeFileSync(f, JSON.stringify(s), { mode: 0o600 });
  return s;
}

export function envServeur() {
  const s = secrets();
  const env = {
    NEXT_PUBLIC_URL_EXTERNE: CIBLES.local.externe,
    NEXT_PUBLIC_URL_INTERNE: CIBLES.local.interne,
    ESPACE_CLIENT_URL: CIBLES.local.externe,
    ENVOI_MODE: "desactive",
    CREAGIDEM_MODE: "inactif",
    BREVO_API_KEY: COUPEE,
    // Un serveur qui se dit « recette » : comme le service de recette (paiement simulé permis, jeu de démo jamais semé hors production).
    RAILWAY_ENVIRONMENT_NAME: "batterie-locale",
    EMAILS_ENTRANTS_SECRET: s.emails,
    DIAGNOSTIC_SECRET: s.diagnostic,
    TACHES_SECRET: s.taches,
    SMS_REPONSES_SECRET: s.sms,
    BREVO_WEBHOOK_SECRET: s.brevo,
    NEXT_TELEMETRY_DISABLED: "1",
    // Les serveurs de Railway tournent en temps universel, les visiteurs à l'heure de Paris : le banc fait de même,
    // pour qu'une date mise en forme sans fuseau (écart entre le rendu du serveur et celui du navigateur) s'y voie.
    TZ: "UTC",
  };
  if (process.env.AVEC_GEMINI !== "1") env.GEMINI_API_KEY = COUPEE;
  return env;
}

export const DOSSIER_APP = (app) => path.join(RACINE, "apps", app);
export const URL_PRETE = { externe: `${CIBLES.local.externe}/`, interne: `${CIBLES.local.interne}/login` };
export { PORTS };

/** Le build est-il plus récent que le code ? Sinon la batterie testerait une ancienne version. */
export function buildPerime(app) {
  const id = path.join(DOSSIER_APP(app), ".next", "BUILD_ID");
  if (!fs.existsSync(id)) return "aucun build";
  const marque = path.join(DOSSIER_APP(app), ".next", "batterie.json");
  if (!fs.existsSync(marque)) return "build fait hors de la batterie (adresses de production ou de développement)";
  const quand = fs.statSync(id).mtimeMs;
  const sources = [path.join(DOSSIER_APP(app), "src"), path.join(RACINE, "packages/commun/src"), path.join(DOSSIER_APP(app), "next.config.ts")];
  const plusRecent = (p) => {
    const st = fs.statSync(p);
    if (st.isFile()) return st.mtimeMs > quand ? p : null;
    for (const e of fs.readdirSync(p)) {
      const r = plusRecent(path.join(p, e));
      if (r) return r;
    }
    return null;
  };
  const r = sources.filter((p) => fs.existsSync(p)).map(plusRecent).find(Boolean);
  return r ? `modifié depuis le build : ${path.relative(RACINE, r)}` : null;
}

/*
 * `node outils/serveurs.mjs --lancer` : lance les deux apps et les laisse
 * tourner (mise au point avec PARTAGE=1). Ctrl-C les arrête.
 */
if (process.argv[1] && process.argv[1].endsWith("serveurs.mjs") && process.argv.includes("--lancer")) {
  const { spawn } = await import("node:child_process");
  for (const app of ["externe", "interne"]) {
    const p = spawn("npx", ["next", "start", "-p", String(PORTS[app])], { cwd: DOSSIER_APP(app), env: { ...process.env, ...envServeur() }, stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (code) => console.log(`[serveurs] ${app} arrêté (${code})`));
  }
}
