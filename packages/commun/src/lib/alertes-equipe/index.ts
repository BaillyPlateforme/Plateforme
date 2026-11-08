import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { baseCrm, type Lire } from "@/lib/base-crm";
import { versInterne } from "@/lib/adresses";
import { bouton, echapper, mention, mettreEnPage, paragraphe } from "@/lib/email-layout";
import { envoyerEmail } from "@/lib/envois";
import { getSettings } from "@/lib/settings";
import { alerteDe, CONSEILLER, remplirAlerte, type DefAlerte } from "./catalogue";

/*
 * Les alertes de l'équipe : qui les reçoit (abonnements), et leur envoi.
 *
 * Les réglages vivent dans le schéma crm (crm.alertes_destinataires,
 * crm.alertes_abonnements, crm.alertes_reglages, crm.alertes_evenements,
 * voir apps/interne/src/crm/alertes/schema.ts) ; l'équipe, elle, se lit dans
 * public.team_members, sans y écrire. L'app externe n'a pas le pool du CRM :
 * ce module passe par la petite connexion des modules partagés (base-crm.ts),
 * d'une connexion, par DATABASE_URL. Sans base lisible
 * (variable absente, tables pas encore créées), une alerte qui existait part
 * comme avant — à ESPACE_CLIENT_EMAIL_EQUIPE, sinon au conseiller du
 * dossier — et une alerte nouvelle ne part pas.
 *
 * Tout part par le module d'envoi (lib/envois) : ENVOI_MODE, liste blanche,
 * journal, avec une clé d'idempotence par événement et par destinataire
 * (« alerte:<alerte>:<événement>:<adresse> »). Une alerte ne lève jamais :
 * elle ne doit pas faire échouer le geste qui la déclenche.
 */

/** Le lecteur propre aux modules partagés (une connexion, mode session), ou rien sans DATABASE_URL utilisable. */
const base = baseCrm;

/** L'adresse de ESPACE_CLIENT_EMAIL_EQUIPE, quand elle est réglée : elle recevait les alertes de l'espace client. */
export const adresseVariable = () => process.env.ESPACE_CLIENT_EMAIL_EQUIPE?.trim().toLowerCase() || null;

export interface Destinataire {
  /** L'adresse en minuscules, ou « @conseiller ». */
  cle: string;
  email: string | null;
  nom: string;
  source: "equipe" | "manuel" | "variable" | "conseiller";
  enPause: boolean;
}

export interface Reglage {
  actif: boolean;
  objet: string | null;
  corps: string | null;
  valide: boolean;
  maj_par: string | null;
  maj_le: string | null;
}

export interface EtatAlertes {
  destinataires: Destinataire[];
  /** « <cle du destinataire>|<alerte> » → abonné ou non, quand l'équipe l'a réglé. */
  abonnements: Map<string, boolean>;
  reglages: Map<string, Reglage>;
}

/** L'état des abonnements, lu par `lire` (le pool du CRM côté interne) ou par la connexion propre au module. */
export async function lireEtat(lire?: Lire): Promise<EtatAlertes | null> {
  const l = lire ?? base();
  if (!l) return null;
  try {
    const [equipe, dest, abo, reg] = await Promise.all([
      l<{ email: string; nom: string | null }>("select lower(email) as email, nom from public.team_members where actif and email is not null order by created_at"),
      l<{ email: string; nom: string | null; manuel: boolean; en_pause: boolean }>("select email, nom, manuel, en_pause from crm.alertes_destinataires order by cree_le"),
      l<{ email: string; alerte: string; abonne: boolean }>("select email, alerte, abonne from crm.alertes_abonnements"),
      l<Reglage & { cle: string }>("select cle, actif, objet, corps, valide, maj_par, maj_le::text from crm.alertes_reglages"),
    ]);
    const parEmail = new Map(dest.map((d) => [d.email, d]));
    const pause = (cle: string) => parEmail.get(cle)?.en_pause ?? false;
    const out: Destinataire[] = [{ cle: CONSEILLER, email: null, nom: "Le conseiller du dossier", source: "conseiller", enPause: pause(CONSEILLER) }];
    const variable = adresseVariable();
    if (variable) out.push({ cle: variable, email: variable, nom: "Adresse de l'équipe (ESPACE_CLIENT_EMAIL_EQUIPE)", source: "variable", enPause: pause(variable) });
    for (const e of equipe) if (!out.some((o) => o.cle === e.email)) out.push({ cle: e.email, email: e.email, nom: e.nom || e.email, source: "equipe", enPause: pause(e.email) });
    for (const d of dest) if (d.manuel && !out.some((o) => o.cle === d.email)) out.push({ cle: d.email, email: d.email, nom: d.nom || d.email, source: "manuel", enPause: d.en_pause });
    return {
      destinataires: out,
      abonnements: new Map(abo.map((a) => [`${a.email}|${a.alerte}`, a.abonne])),
      reglages: new Map(reg.map(({ cle, ...r }) => [cle, r])),
    };
  } catch (e) {
    console.error("Alertes : abonnements illisibles, destinataires d'avant", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Abonné d'office : pour une alerte qui existait, celui qui la recevait déjà. */
export function abonneDOffice(def: DefAlerte, cle: string) {
  if (!def.heritee) return false;
  const variable = adresseVariable();
  return variable ? cle === variable : cle === CONSEILLER;
}

export function estAbonne(etat: EtatAlertes, cle: string, alerte: string) {
  const v = etat.abonnements.get(`${cle}|${alerte}`);
  if (v !== undefined) return v;
  const def = alerteDe(alerte);
  return !!def && abonneDOffice(def, cle);
}

export const alerteActive = (etat: EtatAlertes, alerte: string) => etat.reglages.get(alerte)?.actif ?? true;

/**
 * Les adresses à qui part une alerte maintenant : abonnées, pas en pause,
 * l'alerte active. « Le conseiller du dossier » se résout en `conseillers`,
 * sauf celui qui s'est lui-même désabonné ou mis en pause.
 */
export async function destinatairesAlerte(alerte: string, o: { conseillers?: (string | null | undefined)[] } = {}) {
  const def = alerteDe(alerte);
  if (!def) return { destinataires: [] as { email: string; desabonnement: string | null }[], reglage: null as Reglage | null };
  const conseillers = [...new Set((o.conseillers ?? []).filter((c): c is string => !!c?.trim()).map((c) => c.trim().toLowerCase()))];
  const etat = await lireEtat();
  let emails: string[] = [];
  if (!etat) {
    const variable = adresseVariable();
    emails = def.heritee ? (variable ? [variable] : conseillers) : [];
  } else if (alerteActive(etat, alerte)) {
    for (const d of etat.destinataires) {
      if (d.enPause || !estAbonne(etat, d.cle, alerte)) continue;
      if (d.source !== "conseiller") emails.push(d.email!);
      else emails.push(...conseillers.filter((c) => etat.abonnements.get(`${c}|${alerte}`) !== false && !etat.destinataires.some((x) => x.cle === c && x.enPause)));
    }
  }
  return {
    destinataires: [...new Set(emails)].map((email) => ({ email, desabonnement: lienDesabonnement(email, alerte) })),
    reglage: etat?.reglages.get(alerte) ?? null,
  };
}

// --- Le lien de désabonnement : un jeton signé, sans connexion -----------------------------------

const secret = () => process.env.ALERTES_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const signer = (charge: string) => createHmac("sha256", `bailly-alertes:${secret()}`).update(charge).digest("base64url").slice(0, 32);

/** Le jeton d'une adresse et d'une alerte ; aucun sans secret (ALERTES_SECRET, à défaut la clé de service). */
export function jetonDesabonnement(email: string, alerte: string): string | null {
  if (!secret()) return null;
  const charge = Buffer.from(JSON.stringify([email.trim().toLowerCase(), alerte])).toString("base64url");
  return `${charge}.${signer(charge)}`;
}

export function lireJeton(jeton: string): { email: string; alerte: string } | null {
  const [charge, sig] = String(jeton ?? "").split(".");
  if (!charge || !sig || !secret()) return null;
  const attendu = Buffer.from(signer(charge));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const [email, alerte] = JSON.parse(Buffer.from(charge, "base64url").toString("utf8")) as [string, string];
    return typeof email === "string" && typeof alerte === "string" && alerteDe(alerte) ? { email, alerte } : null;
  } catch {
    return null;
  }
}

export const lienDesabonnement = (email: string, alerte: string) => {
  const j = jetonDesabonnement(email, alerte);
  return j ? versInterne(`/desabonnement/${j}`) : null;
};

/** Le pied des alertes dont le texte vient du code (espace client) : ajouté à leur payload. */
export const champDesabonnement = (d: { desabonnement: string | null }) => (d.desabonnement ? { desabonnement: d.desabonnement } : {});

/** Une ligne au journal des alertes (crm.alertes_evenements). Jamais bloquante. */
export async function noterEvenement(alerte: string, evenement: string, reference: string | null | undefined, destinataires: number, resume: string) {
  try {
    await base()?.("insert into crm.alertes_evenements(alerte, evenement, reference, destinataires, resume) values($1,$2,$3,$4,$5)", [
      alerte, evenement.slice(0, 200), reference ?? null, destinataires, resume.slice(0, 500),
    ]);
  } catch (e) {
    console.error("Alertes : événement non noté", e instanceof Error ? e.message : e);
  }
}

/** Le texte d'une alerte : celui réglé par l'équipe, sinon le texte neutre de départ. */
export const texteAlerte = (def: DefAlerte, reglage: Reglage | null) =>
  reglage?.corps?.trim() ? { objet: reglage.objet?.trim() || def.depart?.objet || def.titre, corps: reglage.corps } : (def.depart ?? { objet: def.titre, corps: "" });

/** L'e-mail d'une alerte au texte neutre ou réglé, mis en page : sert à l'envoi et à l'aperçu. */
export async function composerAlerte(def: DefAlerte, reglage: Reglage | null, vars: Record<string, unknown>, lienEv: { chemin: string; libelle: string } | null, desabonnement: string | null) {
  const texte = texteAlerte(def, reglage);
  const sujet = remplirAlerte(texte.objet, vars);
  const corps = remplirAlerte(texte.corps, vars);
  const settings = await getSettings().catch(() => null);
  const lien = lienEv ? versInterne(lienEv.chemin) : null;
  const html = mettreEnPage({
    titre: sujet,
    surtitre: "Alerte de l'équipe",
    base: (settings?.base_url || "").replace(/\/$/, ""),
    apercu: corps.split("\n")[0]?.slice(0, 140),
    entreprise: { nom: settings?.entreprise_nom ?? undefined, email: settings?.entreprise_email ?? undefined },
    corps: [
      ...corps.split(/\n+/).filter((l) => l.trim()).map((l) => paragraphe(echapper(l))),
      lien && lienEv ? bouton(lienEv.libelle, lien) : "",
      mention(
        `Vous recevez cette alerte (« ${echapper(def.titre)} ») parce que votre adresse y est abonnée dans BaillyCRM, Relances › Alertes de l'équipe.${desabonnement ? ` <a href="${echapper(desabonnement)}" style="color:inherit;">Ne plus recevoir cette alerte</a>.` : ""}`,
      ),
    ].join("\n"),
  });
  return { sujet, html, texte: `${corps}${lien ? `\n\n${lien}` : ""}${desabonnement ? `\n\nNe plus recevoir cette alerte : ${desabonnement}` : ""}` };
}

/**
 * Envoie une alerte au texte neutre (ou réglé par l'équipe) à ses abonnés.
 * `evenement` identifie l'événement : avec l'adresse, il fait la clé
 * d'idempotence — le même événement ne part pas deux fois à la même adresse.
 */
export async function alerterEquipe(
  alerte: string,
  ev: {
    evenement: string;
    reference?: string | null;
    vars: Record<string, unknown>;
    lien?: { chemin: string; libelle: string } | null;
    conseillers?: (string | null | undefined)[];
    origine?: "crm" | "espace_client" | "veille" | "questionnaires";
  },
): Promise<{ destinataires: number; partis: number }> {
  try {
    const def = alerteDe(alerte);
    if (!def?.depart) return { destinataires: 0, partis: 0 };
    const { destinataires, reglage } = await destinatairesAlerte(alerte, { conseillers: ev.conseillers });
    if (!destinataires.length) {
      await noterEvenement(alerte, ev.evenement, ev.reference, 0, "Aucun abonné : rien n'est parti.");
      return { destinataires: 0, partis: 0 };
    }
    let partis = 0;
    const issues: string[] = [];
    for (const d of destinataires) {
      const m = await composerAlerte(def, reglage, ev.vars, ev.lien ?? null, d.desabonnement);
      const r = await envoyerEmail({
        cle: `alerte:${alerte}:${ev.evenement}:${d.email}`,
        origine: ev.origine ?? "crm",
        modele: `Alerte équipe : ${def.titre}`,
        reference: ev.reference ?? null,
        a: d.email,
        sujet: m.sujet,
        html: m.html,
        texte: m.texte,
      });
      if (r.statut === "envoye") partis++;
      issues.push(r.doublon ? "déjà traitée (même événement)" : r.statut);
    }
    await noterEvenement(alerte, ev.evenement, ev.reference, destinataires.length, `${destinataires.length} destinataire${destinataires.length > 1 ? "s" : ""} : ${[...new Set(issues)].join(", ")}`);
    return { destinataires: destinataires.length, partis };
  } catch (e) {
    console.error(`Alertes : « ${alerte} » non envoyée`, e instanceof Error ? e.message : e);
    return { destinataires: 0, partis: 0 };
  }
}
