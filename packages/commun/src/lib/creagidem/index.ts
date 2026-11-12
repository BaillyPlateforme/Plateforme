import "server-only";
import { URL_INTERNE } from "@/lib/adresses";
import { estAdresseFictive } from "@/lib/envois/garde-fous";
import { createServiceClient } from "@/lib/supabase/server";
import { distanceEntreVilles } from "@/lib/trajet";
import type { RequestRow } from "@/lib/types";
import { ficheDepuisDemande, manquesFiche, type FicheCreagidem } from "./fiche";

/*
 * Créagidem, l'outil métier de Bailly : chaque demande du site y devient une
 * fiche, comme le faisait le script PHP du site WordPress (formbailly.php).
 *
 *   1. POST {CREAGIDEM_URL}/api/v1/authentication
 *        { client_id, private_key, licence }  →  { access_token }
 *   2. POST {CREAGIDEM_URL}/api/v1/importfiche   (Authorization: Bearer …)
 *        la fiche (fiche.ts) et guid_licence.
 *
 * Les accès, fournis par Créagiciel (le .env du script) :
 *   CREAGIDEM_URL, CREAGIDEM_CLIENT_ID, CREAGIDEM_PRIVATE_KEY,
 *   CREAGIDEM_LICENCE, CREAGIDEM_EMETTEUR, CREAGIDEM_GUID.
 *
 * Le garde-fou. Créagidem est l'outil de production de Bailly : une fiche de
 * trop, c'est un faux client dans leurs plannings. Une fiche ne part donc que
 * si TOUT est vrai :
 *   - CREAGIDEM_MODE=actif (sinon : préparée et journalisée, jamais envoyée) ;
 *   - l'environnement Railway s'appelle « production » (RAILWAY_ENVIRONMENT_NAME) :
 *     l'environnement dev, et tout poste de développement, ne remplissent
 *     jamais Créagidem, même avec les accès et le mode actif ;
 *   - les six accès sont réglés ;
 *   - l'adresse du client n'est pas fictive (@example.com…).
 * Dans tous les autres cas, la fiche est préparée et gardée dans
 * l'historique de la demande (request_events, type « creagidem »), pour
 * qu'on voie exactement ce qui serait parti.
 *
 * Une demande n'est envoyée qu'une fois automatiquement ; « Envoyer dans
 * Créagidem », sur la page de la demande, la renvoie à la main.
 */

const ACCES = ["CREAGIDEM_URL", "CREAGIDEM_CLIENT_ID", "CREAGIDEM_PRIVATE_KEY", "CREAGIDEM_LICENCE", "CREAGIDEM_EMETTEUR", "CREAGIDEM_GUID"] as const;
const DELAI_MS = 15_000;

export interface ReglageCreagidem {
  /** Une fiche partirait-elle vraiment ? */
  envoie: boolean;
  environnement: string;
  modeActif: boolean;
  manquants: string[];
  /** Pourquoi rien ne part, en clair ; null quand tout part. */
  motif: string | null;
}

const lire = (env: NodeJS.ProcessEnv, k: string) => (env[k] ?? "").trim();

/** L'environnement : celui de Railway, sinon « local » (un poste de développement). */
export const environnement = (env: NodeJS.ProcessEnv = process.env) => lire(env, "RAILWAY_ENVIRONMENT_NAME").toLowerCase() || "local";

export function reglageCreagidem(env: NodeJS.ProcessEnv = process.env): ReglageCreagidem {
  const lieu = environnement(env);
  const modeActif = lire(env, "CREAGIDEM_MODE").toLowerCase() === "actif";
  const manquants = ACCES.filter((k) => !lire(env, k));
  const motif =
    lieu !== "production"
      ? `Garde-fou : environnement « ${lieu} ». Seule la production remplit Créagidem ; ici, la fiche est préparée, jamais envoyée.`
      : !modeActif
        ? "CREAGIDEM_MODE n'est pas « actif » : la fiche est préparée, jamais envoyée."
        : manquants.length
          ? `Accès Créagidem incomplets (${manquants.join(", ")}) : la fiche est préparée, jamais envoyée.`
          : null;
  return { envoie: motif === null, environnement: lieu, modeActif, manquants, motif };
}

export type StatutFiche = "envoyee" | "preparee" | "incomplete" | "echec";

export interface EvenementCreagidem {
  statut: StatutFiche;
  motif: string | null;
  origine: "automatique" | "manuel";
  par: string | null;
  environnement: string;
  /** La fiche telle qu'elle part (sans la licence). */
  fiche: FicheCreagidem | null;
  /** La réponse de Créagidem, tronquée. */
  reponse?: string | null;
  http?: number | null;
}

/** Un appel à l'API. La réponse est rendue entière : celle de l'authentification porte deux jetons. */
async function appeler(url: string, corps: unknown, jeton?: string): Promise<{ http: number; texte: string }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(DELAI_MS),
  });
  return { http: r.status, texte: await r.text().catch(() => "") };
}

/*
 * Le jeton d'accès, gardé tant qu'il vaut. Créagidem compte chaque appel
 * (10 par minute, 50 par jour pour l'accès de Bailly, constaté le 12/11/2026) :
 * s'authentifier à chaque fiche en coûterait deux. Le jeton vit deux heures ;
 * on le garde jusqu'à cinq minutes de sa fin. Rangé sur globalThis, comme les
 * espaces pro : Next charge ce module plusieurs fois.
 */
type JetonGarde = { jeton: string; jusqua: number };
const coffre = globalThis as typeof globalThis & { __jetonCreagidem?: JetonGarde | null };
const MARGE_MS = 5 * 60_000;

async function jetonCreagidem(base: string): Promise<{ jeton: string } | { erreur: string; http: number }> {
  const garde = coffre.__jetonCreagidem;
  if (garde && garde.jusqua - MARGE_MS > Date.now()) return { jeton: garde.jeton };
  const auth = await appeler(`${base}/api/v1/authentication`, {
    client_id: lire(process.env, "CREAGIDEM_CLIENT_ID"),
    private_key: lire(process.env, "CREAGIDEM_PRIVATE_KEY"),
    licence: lire(process.env, "CREAGIDEM_LICENCE"),
  });
  if (auth.http !== 200 && auth.http !== 201) return { erreur: `Authentification refusée (HTTP ${auth.http}) : ${auth.texte.slice(0, 300)}`, http: auth.http };
  let reponse: { access_token?: unknown; exp?: unknown } = {};
  try {
    reponse = JSON.parse(auth.texte);
  } catch {
    reponse = {};
  }
  if (typeof reponse.access_token !== "string" || !reponse.access_token) return { erreur: "Authentification sans jeton d'accès.", http: auth.http };
  // `exp` est en secondes ; sans lui, une heure par prudence.
  const jusqua = typeof reponse.exp === "number" && reponse.exp > 0 ? reponse.exp * 1000 : Date.now() + 60 * 60_000;
  coffre.__jetonCreagidem = { jeton: reponse.access_token, jusqua };
  return { jeton: reponse.access_token };
}

/** L'envoi lui-même : jeton d'accès, puis import de la fiche. Seul reglageCreagidem() y mène. */
async function envoyer(fiche: FicheCreagidem): Promise<{ ok: boolean; http: number | null; reponse: string }> {
  const base = lire(process.env, "CREAGIDEM_URL").replace(/\/$/, "");
  const corps = { ...fiche, guid_licence: lire(process.env, "CREAGIDEM_GUID") };
  for (let essai = 0; essai < 2; essai++) {
    const acces = await jetonCreagidem(base);
    if ("erreur" in acces) return { ok: false, http: acces.http, reponse: acces.erreur };
    const r = await appeler(`${base}/api/v1/importfiche`, corps, acces.jeton);
    // Jeton refusé (révoqué, horloge décalée) : on l'oublie et on en redemande un, une fois.
    if ((r.http === 401 || r.http === 403) && essai === 0) {
      coffre.__jetonCreagidem = null;
      continue;
    }
    return { ok: r.http === 200 || r.http === 201, http: r.http, reponse: (r.texte || `HTTP ${r.http}`).slice(0, 1000) };
  }
  return { ok: false, http: null, reponse: "Jeton refusé deux fois." };
}

/** Le dernier passage d'une demande par Créagidem, s'il y en a eu un. */
export async function dernierEvenementCreagidem(requestId: string): Promise<(EvenementCreagidem & { le: string }) | null> {
  const { data } = await createServiceClient()
    .from("request_events")
    .select("payload, created_at")
    .eq("request_id", requestId)
    .eq("type", "creagidem")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { ...(data.payload as EvenementCreagidem), le: data.created_at as string } : null;
}

/**
 * Prépare la fiche d'une demande et l'envoie à Créagidem si le garde-fou le
 * permet. Ne lève jamais : une demande du site ne doit pas échouer à cause de
 * l'outil métier. Rend ce qui a été inscrit à l'historique.
 */
export async function transmettreACreagidem(
  requestId: string,
  o: { origine: "automatique" | "manuel"; par?: string | null } = { origine: "automatique" },
): Promise<EvenementCreagidem | null> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
    const r = data as RequestRow | null;
    if (!r) return null;

    // Automatiquement, une seule fois : une demande déjà envoyée ne repart qu'à la main.
    if (o.origine === "automatique") {
      const dernier = await dernierEvenementCreagidem(requestId);
      if (dernier?.statut === "envoyee") return dernier;
    }

    const reglage = reglageCreagidem();
    const distanceKm =
      r.distance_km ??
      (r.depart_ville && r.arrivee_ville
        ? await distanceEntreVilles(
            { ville: r.depart_ville, code_postal: r.depart_code_postal, adresse: r.depart_adresse },
            { ville: r.arrivee_ville, code_postal: r.arrivee_code_postal, adresse: r.arrivee_adresse },
          ).catch(() => null)
        : null);
    const fiche = ficheDepuisDemande(r, {
      emetteur: lire(process.env, "CREAGIDEM_EMETTEUR"),
      distanceKm,
      lienCrm: URL_INTERNE ? `${URL_INTERNE}/dashboard/${r.id}` : null,
    });

    const base = { origine: o.origine, par: o.par ?? null, environnement: reglage.environnement, fiche };
    const manques = manquesFiche(fiche);
    let ev: EvenementCreagidem;
    if (manques.length) {
      ev = { ...base, statut: "incomplete", motif: `Champs obligatoires de Créagidem manquants : ${manques.join(", ")}. La fiche partira quand la demande sera complétée.` };
    } else if (!reglage.envoie) {
      ev = { ...base, statut: "preparee", motif: reglage.motif };
    } else if (r.client_email && estAdresseFictive(r.client_email)) {
      ev = { ...base, statut: "preparee", motif: "Adresse e-mail fictive (essai) : la fiche n'est jamais envoyée." };
    } else {
      try {
        const res = await envoyer(fiche);
        ev = res.ok
          ? { ...base, statut: "envoyee", motif: null, http: res.http, reponse: res.reponse }
          : { ...base, statut: "echec", motif: "Créagidem a refusé la fiche.", http: res.http, reponse: res.reponse };
      } catch (e) {
        ev = { ...base, statut: "echec", motif: `Créagidem ne répond pas : ${e instanceof Error ? e.message : "erreur inconnue"}.`, http: null, reponse: null };
      }
    }
    await supabase.from("request_events").insert({ request_id: r.id, type: "creagidem", payload: ev });
    if (ev.statut === "echec") console.error(`[demande ${r.id}] Créagidem : ${ev.motif} ${ev.reponse ?? ""}`);
    return ev;
  } catch (e) {
    console.error(`[demande ${requestId}] Créagidem : fiche non préparée`, e instanceof Error ? e.message : e);
    return null;
  }
}
