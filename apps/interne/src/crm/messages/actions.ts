"use server";

import { revalidatePath } from "next/cache";
import { saveAlert } from "@/lib/actions/alerts";
import { saveTemplate } from "@/lib/actions/templates";
import { listAlerts } from "@/lib/alerts";
import { bouton, mention, tableau } from "@/lib/email-layout";
import { rendreEmail as rendreEmailQuestionnaire } from "@/lib/email-render";
import { oublierTextesEspace } from "@/lib/espace-client/catalogue-textes";
import { rendreEmail as rendreEmailEspace } from "@/lib/espace-client/emails";
import { remplirTexte, TEXTES_ESPACE } from "@/lib/espace-client/textes-messages";
import { TEL_AGENCE, renderTemplate } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { listTemplates } from "@/lib/templates";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { rendreEmailCrm } from "@/crm/envois";
import { entree, modeleDe, remplir } from "./catalogue";

/*
 * Les gestes de « Courriers et SMS ». Chaque action revérifie que c'est
 * l'équipe (currentUser : session ET membre actif de team_members) : une
 * action serveur peut être appelée depuis n'importe quelle adresse.
 *
 * Cartes du CRM et de l'espace client : crm.modeles_messages. Cartes des
 * questionnaires : leurs propres actions (saveAlert, saveTemplate), qui
 * revérifient l'équipe à leur tour.
 */

export type Retour = { ok: true; message?: string } | { ok: false; erreur: string };

const rafraichir = () => {
  oublierTextesEspace();
  revalidatePath("/modeles");
  revalidatePath("/relances");
};

/** Active ou désactive une carte. Un texte vide ne s'active pas ; une carte verrouillée ne se désactive pas. */
export async function basculerCarte(cle: string, actif: boolean): Promise<Retour> {
  const u = await currentUser();
  const e = entree(cle);
  if (!e) return { ok: false, erreur: "Carte inconnue." };
  if (e.verrouillee && !actif) return { ok: false, erreur: e.verrouillee };
  const m = await modeleDe(cle);
  if (!m) return { ok: false, erreur: "Modèle introuvable." };
  if (actif && !e.texteCode && !m.corps.trim()) return { ok: false, erreur: "Rédigez d'abord le texte : une carte sans texte ne s'active pas." };
  await q("update modeles_messages set actif=$2, maj_le=now() where cle=$1", [cle, actif]);
  await q("insert into activite(libelle, utilisateur_id) values($1, $2)", [`Courriers et SMS : « ${e.titre} » ${actif ? "activé" : "désactivé"}`, u.id]).catch(() => undefined);
  rafraichir();
  return { ok: true, message: `« ${e.titre} » ${actif ? "activé" : "désactivé"}.` };
}

/** Enregistre le texte d'une carte. Enregistré par l'équipe, il est validé ; vidé, la carte se désactive. */
export async function enregistrerCarte(cle: string, objet: string | null, corps: string): Promise<Retour> {
  await currentUser();
  const e = entree(cle);
  if (!e) return { ok: false, erreur: "Carte inconnue." };
  if (e.texteCode) return { ok: false, erreur: "Ce texte est composé par la plateforme : il ne se modifie pas ici." };
  const texte = corps.replace(/\r\n/g, "\n").trim();
  if (texte.length > (e.canal === "sms" ? 640 : 8000)) return { ok: false, erreur: e.canal === "sms" ? "Un SMS ne dépasse pas 640 caractères (4 SMS)." : "Texte trop long." };
  const inconnues = [...texte.matchAll(/\{([a-z_]+)\}/gi)].map((x) => x[1]).filter((v) => !e.variables.includes(v));
  if (inconnues.length) return { ok: false, erreur: `Variable inconnue : {${inconnues[0]}}. Celles de ce message : ${e.variables.map((v) => `{${v}}`).join(" ")}.` };
  await q(
    "update modeles_messages set objet=$2, corps=$3, a_valider=$4, actif = case when $3 = '' then false else actif end, maj_le=now() where cle=$1",
    [cle, e.canal === "email" ? objet?.trim() || null : null, texte, !texte],
  );
  rafraichir();
  return { ok: true, message: texte ? "Texte enregistré." : "Texte vidé : la carte est désactivée." };
}

const EXEMPLE_CRM = { client: "Madame Exemple", commercial: "Votre conseiller", date: "12/12/2026", heure: "10:00", ref: "BD-2026-0001", montant: "1 234,00 €", pieces: "Justificatif de domicile" };
const EXEMPLE_ESPACE: Record<string, unknown> = {
  salutation: "Madame Exemple", prenom: "Camille", document: "Attestation d'assurance", nb: 30, jour: "samedi 14 novembre", debut: "9 h 00", fin: "10 h 00",
  adresse: "1 rue de l'Exemple, 75001 Paris", contact: "Camille Exemple", telephone: TEL_AGENCE, montant: "360,00 €", libelle: "Arrhes 30 % · devis DV-2026-0001",
  reference: "pi_exemple", numero: "SAV-2026-001", objets: "Une table basse", trajet: "Paris → Lyon", chemin: "/espace-client", lien_avis: "#",
  signature: { nom: "Votre conseiller", role: "Votre contact", telephone: TEL_AGENCE },
};

export type Apercu = { canal: "email" | "sms"; sujet: string | null; html: string | null; texte: string };

/** L'aperçu d'un texte en cours de saisie, rendu comme à l'envoi, avec des valeurs d'exemple. */
export async function apercuCarte(cle: string, objet: string | null, corps: string): Promise<Apercu | null> {
  await currentUser();
  const e = entree(cle);
  if (!e) return null;
  const espace = TEXTES_ESPACE.find((t) => t.cle === cle);
  if (e.canal === "sms") return { canal: "sms", sujet: null, html: null, texte: espace ? remplirTexte(corps, EXEMPLE_ESPACE) : remplir(corps, EXEMPLE_CRM) };
  if (espace || e.texteCode) {
    const base = (process.env.ESPACE_CLIENT_URL || process.env.NEXT_PUBLIC_URL_EXTERNE || "").replace(/\/$/, "");
    const r = rendreEmailEspace(e.texteCode ? "acces" : espace!.modele, { ...EXEMPLE_ESPACE, lien: "#", email: "client@exemple.fr", duree: 15, periode: "en décembre 2026", depart: "Paris", arrivee: "Lyon" }, base, e.texteCode ? null : { objet, corps });
    return { canal: "email", sujet: r.sujet, html: r.html, texte: r.texte };
  }
  // « Devis prêt » : ce que l'envoi ajoute au texte — la formule, son montant, le bouton de signature.
  const ajout = cle === "devis_pret" ? [tableau([["Formule Standard · devis DV-2026-0001", "1 950,00 €"]]), bouton("Signer le devis", "#"), mention("Ou signez en ligne : (lien de signature du devis)")].join("\n") : "";
  const r = await rendreEmailCrm({ objet, corps }, EXEMPLE_CRM, ajout);
  return { canal: "email", sujet: r.sujet, html: r.html, texte: r.texte };
}

// --- Les cartes des questionnaires : leurs règles et leurs modèles -------------------------------

export async function basculerQuestionnaire(alerteId: string, actif: boolean): Promise<Retour> {
  await currentUser();
  const a = (await listAlerts()).find((x) => x.id === alerteId);
  if (!a) return { ok: false, erreur: "Règle introuvable." };
  await saveAlert(a.id, {
    name: a.name, kind: a.kind, event: a.event, montant_min: a.montant_min, channel: a.channel, destinataire: a.destinataire,
    destinataire_custom: a.destinataire_custom, template_id: a.template_id, condition_champ: a.condition_champ, condition_source: a.condition_source, active: actif,
  });
  rafraichir();
  return { ok: true, message: `« ${a.name} » ${actif ? "activé" : "désactivé"}.` };
}

export async function enregistrerQuestionnaire(modeleId: string, sujet: string | null, contenu: string): Promise<Retour> {
  await currentUser();
  const t = (await listTemplates()).find((x) => x.id === modeleId);
  if (!t) return { ok: false, erreur: "Modèle introuvable." };
  if (!contenu.trim()) return { ok: false, erreur: "Le texte ne peut pas être vide." };
  await saveTemplate(t.id, { name: t.name, channel: t.channel, event: t.event, sujet: t.channel === "email" ? sujet?.trim() || null : null, contenu: contenu.replace(/\r\n/g, "\n"), options: t.options ?? {}, active: t.active });
  rafraichir();
  return { ok: true, message: "Texte enregistré." };
}

export async function apercuQuestionnaire(modeleId: string, sujet: string | null, contenu: string): Promise<Apercu | null> {
  await currentUser();
  const t = (await listTemplates()).find((x) => x.id === modeleId);
  if (!t) return null;
  const settings = await getSettings();
  const vars = {
    client_nom: "Camille Exemple", client_email: "client@exemple.fr", client_tel: "06 00 00 00 00", ville_depart: "Paris", ville_arrivee: "Lyon", volume: 25, distance: 465,
    date: "2026-12-12", formule: "standard", reference: "DEV-2026-0001", montant_ttc: 2340, montant_ht: 1950, validite: "2026-12-31",
    entreprise_nom: settings.entreprise_nom, entreprise_tel: settings.entreprise_tel || TEL_AGENCE, entreprise_email: settings.entreprise_email,
    lien_completion: "#", lien_estimation: "#", lien_rappel: "#",
  };
  if (t.channel === "sms") return { canal: "sms", sujet: null, html: null, texte: renderTemplate(contenu, vars) };
  const r = rendreEmailQuestionnaire({ name: t.name, sujet, contenu }, { vars, base: (settings.base_url || "").replace(/\/$/, ""), entreprise: { nom: settings.entreprise_nom ?? undefined, email: settings.entreprise_email ?? undefined, tel: settings.entreprise_tel || TEL_AGENCE } });
  return { canal: "email", sujet: r.sujet, html: r.html, texte: renderTemplate(contenu, vars) };
}

/** Le nombre de cartes à valider, pour la phrase du bandeau. */
export async function nombreAValider(): Promise<number> {
  await currentUser();
  return (await q1<{ n: number }>("select count(*)::int as n from modeles_messages where cle is not null and (a_valider or corps = '') and cle <> 'ec_acces'"))?.n ?? 0;
}
