"use server";

import { revalidatePath } from "next/cache";
import { deleteAlert, saveAlert, type AlertInput } from "@/lib/actions/alerts";
import { deleteTemplate, saveTemplate } from "@/lib/actions/templates";
import { listAlerts } from "@/lib/alerts";
import { bouton, mention, tableau } from "@/lib/email-layout";
import { rendreEmail as rendreEmailQuestionnaire } from "@/lib/email-render";
import { oublierTextesEspace } from "@/lib/espace-client/catalogue-textes";
import { rendreEmail as rendreEmailEspace } from "@/lib/espace-client/emails";
import { remplirTexte, TEXTES_ESPACE } from "@/lib/espace-client/textes-messages";
import { MESSAGE_EVENTS, TEL_AGENCE, renderTemplate, type Channel } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { listTemplates } from "@/lib/templates";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { rendreEmailCrm } from "@/crm/envois";
import { blocRelance, EXEMPLES, surtitreRelance, varsRelance } from "@/crm/relances/courrier";
import { defRelance } from "@/crm/relances/regles";
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
  conseiller: "Camille Martin", dossier: "BD-2026-0001",
  signature: { nom: "Votre conseiller", role: "Votre contact", telephone: TEL_AGENCE },
};

export type Apercu = { canal: "email" | "sms"; sujet: string | null; html: string | null; texte: string };

/** L'aperçu d'un texte en cours de saisie, rendu comme à l'envoi, avec des valeurs d'exemple. */
export async function apercuCarte(cle: string, objet: string | null, corps: string): Promise<Apercu | null> {
  await currentUser();
  const e = entree(cle);
  if (!e) return null;
  const espace = TEXTES_ESPACE.find((t) => t.cle === cle);
  // Une carte de relance : sa liste d'exemple ({elements}), mise en page comme à l'envoi.
  const relance = e.regle ? defRelance(e.regle) : null;
  if (relance) {
    const demande = EXEMPLES[relance.type];
    const vars = varsRelance(relance.type, { ...EXEMPLE_CRM }, demande.elements);
    if (e.canal === "sms") return { canal: "sms", sujet: null, html: null, texte: remplir(corps, vars) };
    const liens = { parElement: Object.fromEntries(demande.elements.map((x) => [x.id, "#"])), principal: "#" };
    const r = await rendreEmailCrm({ objet, corps }, vars, "", undefined, { bloc: blocRelance(relance.type, demande, demande.elements, liens), surtitre: surtitreRelance(EXEMPLE_CRM.ref) });
    return { canal: "email", sujet: r.sujet, html: r.html, texte: r.texte };
  }
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

/*
 * Les modèles et les règles des questionnaires, gérés ici depuis que
 * l'ancienne messagerie (/dashboard/messagerie) a rejoint Courriers et SMS
 * (08/11/2026) : créer, modifier, activer, supprimer un modèle ; poser,
 * modifier ou retirer la règle qui l'envoie (événement, conditions,
 * destinataire). Les écritures passent par saveTemplate / saveAlert /
 * deleteTemplate / deleteAlert, celles de l'ancienne page.
 */

/** Ce que l'éditeur envoie pour un modèle. */
export type SaisieModele = { name: string; channel: Channel; event: string; sujet: string; contenu: string; pieceJointe: "" | "estimation"; active: boolean };
/** Ce que l'éditeur envoie pour la règle qui envoie le modèle (vide : pas de règle). */
export type SaisieRegle = {
  id: string | null;
  name: string;
  event: string;
  montant_min: string;
  condition_champ: string;
  condition_source: string;
  destinataire: "client" | "custom";
  destinataire_custom: string;
  active: boolean;
};

const CHAMPS_MANQUANTS = ["volume", "depart", "arrivee"];

/** Enregistre un modèle (créé s'il n'existe pas) et, s'il y en a une, la règle qui l'envoie. */
export async function enregistrerMessage(modeleId: string | null, m: SaisieModele, r: SaisieRegle | null): Promise<Retour & { modeleId?: string }> {
  await currentUser();
  const nom = m.name.trim();
  const contenu = m.contenu.replace(/\r\n/g, "\n");
  if (!nom) return { ok: false, erreur: "Donnez un nom au modèle." };
  if (m.channel !== "email" && m.channel !== "sms") return { ok: false, erreur: "Canal inconnu." };
  if (!MESSAGE_EVENTS.some((e) => e.key === m.event)) return { ok: false, erreur: "Déclencheur inconnu." };
  if (!contenu.trim()) return { ok: false, erreur: "Le texte ne peut pas être vide." };
  if (contenu.length > 8000) return { ok: false, erreur: "Texte trop long." };
  if (modeleId && !(await listTemplates()).some((t) => t.id === modeleId)) return { ok: false, erreur: "Modèle introuvable." };

  let regle: AlertInput | null = null;
  if (r) {
    const montant = r.montant_min.trim() ? Number(r.montant_min.replace(",", ".")) : null;
    if (!r.name.trim()) return { ok: false, erreur: "Donnez un nom à la règle." };
    if (r.event === "manual" || !MESSAGE_EVENTS.some((e) => e.key === r.event)) return { ok: false, erreur: "Choisissez l'événement qui déclenche la règle." };
    if (montant != null && (!Number.isFinite(montant) || montant < 0)) return { ok: false, erreur: "Le montant minimal doit être un nombre positif." };
    if (r.destinataire === "custom" && !r.destinataire_custom.trim()) return { ok: false, erreur: "Indiquez l'adresse ou le numéro de l'équipe." };
    const existante = r.id ? (await listAlerts()).find((a) => a.id === r.id) : undefined;
    if (r.id && !existante) return { ok: false, erreur: "Règle introuvable." };
    regle = {
      name: r.name.trim(),
      // Une règle créée ici est une alerte, comme dans l'ancien onglet « Alertes » ; une règle existante garde son genre.
      kind: existante?.kind ?? "alerte",
      event: r.event,
      montant_min: montant,
      channel: m.channel,
      destinataire: r.destinataire === "custom" ? "custom" : "client",
      destinataire_custom: r.destinataire === "custom" ? r.destinataire_custom.trim() : null,
      template_id: null,
      condition_champ: r.event === "demande_incomplete" && CHAMPS_MANQUANTS.includes(r.condition_champ) ? r.condition_champ : null,
      condition_source: r.condition_source === "form" || r.condition_source === "email" ? r.condition_source : null,
      active: r.active,
    };
  }

  const id = await saveTemplate(modeleId, {
    name: nom,
    channel: m.channel,
    event: m.event,
    sujet: m.channel === "email" ? m.sujet.trim() || null : null,
    contenu,
    options: { piece_jointe: m.channel === "email" && m.pieceJointe ? m.pieceJointe : null },
    active: m.active,
  });
  if (regle) await saveAlert(r!.id, { ...regle, template_id: id });
  rafraichir();
  return { ok: true, message: modeleId ? "Enregistré." : "Modèle créé.", modeleId: id };
}

/** Active ou désactive un modèle qu'aucune règle n'envoie. */
export async function basculerModele(modeleId: string, actif: boolean): Promise<Retour> {
  await currentUser();
  const t = (await listTemplates()).find((x) => x.id === modeleId);
  if (!t) return { ok: false, erreur: "Modèle introuvable." };
  await saveTemplate(t.id, { name: t.name, channel: t.channel, event: t.event, sujet: t.sujet, contenu: t.contenu, options: t.options ?? {}, active: actif });
  rafraichir();
  return { ok: true, message: `« ${t.name} » ${actif ? "activé" : "désactivé"}.` };
}

/** Retire une règle : le modèle qu'elle envoyait reste, sans règle. */
export async function supprimerRegle(alerteId: string): Promise<Retour> {
  await currentUser();
  const a = (await listAlerts()).find((x) => x.id === alerteId);
  if (!a) return { ok: false, erreur: "Règle introuvable." };
  await deleteAlert(a.id);
  rafraichir();
  return { ok: true, message: `Règle « ${a.name} » supprimée.` };
}

/**
 * Supprime un modèle. Un modèle qu'une règle envoie encore ne se supprime
 * pas : la règle resterait sans texte (la base la garde, sans modèle).
 */
export async function supprimerModele(modeleId: string): Promise<Retour> {
  await currentUser();
  const t = (await listTemplates()).find((x) => x.id === modeleId);
  if (!t) return { ok: false, erreur: "Modèle introuvable." };
  const regles = (await listAlerts()).filter((a) => a.template_id === t.id);
  if (regles.length) return { ok: false, erreur: `Ce modèle est envoyé par ${regles.length > 1 ? "les règles" : "la règle"} ${regles.map((a) => `« ${a.name} »`).join(", ")} : supprimez d'abord ${regles.length > 1 ? "ces règles" : "la règle"}.` };
  await deleteTemplate(t.id);
  rafraichir();
  return { ok: true, message: `Modèle « ${t.name} » supprimé.` };
}

/** L'estimation d'exemple de l'aperçu (celle de l'ancienne messagerie), pour le bloc de détail. */
const LIGNES_EXEMPLE = [
  { label: "Transport et manutention", amount: 1500 },
  { label: "Portage charges lourdes", amount: 240 },
  { label: "Garantie dommages standard", amount: 60 },
];

/** L'aperçu d'un modèle des questionnaires en cours de saisie (même non enregistré), rendu comme à l'envoi. */
export async function apercuModele(m: { canal: Channel; nom: string; sujet: string | null; contenu: string; pieceJointe?: "" | "estimation" }): Promise<Apercu | null> {
  await currentUser();
  const settings = await getSettings();
  const vars = {
    client_nom: "Camille Exemple", client_email: "client@exemple.fr", client_tel: "06 00 00 00 00", ville_depart: "Paris", ville_arrivee: "Lyon", volume: 25, distance: 465,
    date: "2026-12-12", formule: "standard", reference: "DEV-2026-0001", montant_ttc: 2340, montant_ht: 1950, validite: "2026-12-31",
    entreprise_nom: settings.entreprise_nom, entreprise_tel: settings.entreprise_tel || TEL_AGENCE, entreprise_email: settings.entreprise_email,
    lien_completion: "#", lien_estimation: "#", lien_rappel: "#",
  };
  if (m.canal === "sms") return { canal: "sms", sujet: null, html: null, texte: renderTemplate(m.contenu, vars) };
  const r = rendreEmailQuestionnaire(
    { name: m.nom || "Nouveau modèle", sujet: m.sujet, contenu: m.contenu },
    {
      vars,
      lignes: LIGNES_EXEMPLE,
      base: (settings.base_url || "").replace(/\/$/, ""),
      entreprise: { nom: settings.entreprise_nom ?? undefined, email: settings.entreprise_email ?? undefined, tel: settings.entreprise_tel || TEL_AGENCE },
      pieceJointe: m.pieceJointe === "estimation",
    },
  );
  return { canal: "email", sujet: r.sujet, html: r.html, texte: renderTemplate(m.contenu, vars) };
}

/** Le nombre de cartes à valider, pour la phrase du bandeau. */
export async function nombreAValider(): Promise<number> {
  await currentUser();
  return (await q1<{ n: number }>("select count(*)::int as n from modeles_messages where cle is not null and (a_valider or corps = '') and cle <> 'ec_acces'"))?.n ?? 0;
}
