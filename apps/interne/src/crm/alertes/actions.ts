"use server";

import { revalidatePath } from "next/cache";
import { emailValide } from "@/lib/envois/garde-fous";
import { rendreEmail } from "@/lib/espace-client/emails";
import { composerAlerte, lireEtat, lireJeton } from "@/lib/alertes-equipe";
import { alerteDe, ALERTES, CONSEILLER } from "@/lib/alertes-equipe/catalogue";
import { TEL_AGENCE } from "@/lib/messaging";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";

/*
 * Les gestes de la page « Alertes de l'équipe » : les destinataires (ajouter,
 * retirer, mettre en pause), les abonnements (un geste, tout, rien),
 * l'activation et le texte de chaque alerte, l'aperçu. Chaque action
 * revérifie l'équipe (currentUser), sauf le désabonnement par lien : c'est le
 * jeton signé qui l'ouvre.
 */

export type Retour = { ok: true; message?: string } | { ok: false; erreur: string };

const rafraichir = () => revalidatePath("/relances/alertes");
const norm = (e: string) => e.trim().toLowerCase();

export async function ajouterDestinataire(email: string, nom: string): Promise<Retour> {
  const u = await currentUser();
  const e = norm(email);
  if (!emailValide(e)) return { ok: false, erreur: "Adresse e-mail invalide." };
  const etat = await lireEtat(q);
  if (etat?.destinataires.some((d) => d.cle === e)) return { ok: false, erreur: "Cette adresse est déjà dans la liste." };
  await q(
    `insert into alertes_destinataires(email, nom, manuel, par) values($1,$2,true,$3)
     on conflict (email) do update set manuel=true, nom=coalesce($2, alertes_destinataires.nom), par=$3, maj_le=now()`,
    [e, nom.trim() || null, u.nom],
  );
  rafraichir();
  return { ok: true, message: `${e} ajoutée. Elle n'est abonnée à rien : cochez ses alertes.` };
}

export async function retirerDestinataire(email: string): Promise<Retour> {
  await currentUser();
  const e = norm(email);
  const d = await q1<{ manuel: boolean }>("select manuel from alertes_destinataires where email=$1", [e]);
  if (!d?.manuel) return { ok: false, erreur: "Seule une adresse ajoutée à la main se retire ; un membre de l'équipe se met en pause." };
  await q("delete from alertes_abonnements where email=$1", [e]);
  await q("delete from alertes_destinataires where email=$1", [e]);
  rafraichir();
  await journaliser({ action: "destinataire_alerte.retire", libelle: `Destinataire retiré des alertes de l'équipe : ${e}`, objet: { type: "destinataire_alerte", id: e }, details: { email: e } });
  return { ok: true, message: `${e} retirée de la liste.` };
}

export async function mettreEnPause(cle: string, enPause: boolean): Promise<Retour> {
  const u = await currentUser();
  const e = cle === CONSEILLER ? CONSEILLER : norm(cle);
  await q(
    `insert into alertes_destinataires(email, en_pause, par) values($1,$2,$3)
     on conflict (email) do update set en_pause=$2, par=$3, maj_le=now()`,
    [e, enPause, u.nom],
  );
  rafraichir();
  return { ok: true, message: enPause ? "Adresse en pause : elle ne reçoit plus aucune alerte." : "Adresse réactivée." };
}

export async function abonner(cle: string, alerte: string, abonne: boolean): Promise<Retour> {
  const u = await currentUser();
  if (!alerteDe(alerte)) return { ok: false, erreur: "Alerte inconnue." };
  const e = cle === CONSEILLER ? CONSEILLER : norm(cle);
  await q(
    `insert into alertes_abonnements(email, alerte, abonne, par) values($1,$2,$3,$4)
     on conflict (email, alerte) do update set abonne=$3, par=$4, maj_le=now()`,
    [e, alerte, abonne, u.nom],
  );
  rafraichir();
  return { ok: true };
}

/** « Tout » ou « rien » pour une adresse : toutes les alertes du catalogue. */
export async function toutOuRien(cle: string, abonne: boolean): Promise<Retour> {
  const u = await currentUser();
  const e = cle === CONSEILLER ? CONSEILLER : norm(cle);
  await q(
    `insert into alertes_abonnements(email, alerte, abonne, par) select $1, a, $2, $3 from unnest($4::text[]) a
     on conflict (email, alerte) do update set abonne=$2, par=$3, maj_le=now()`,
    [e, abonne, u.nom, ALERTES.map((a) => a.cle)],
  );
  rafraichir();
  return { ok: true, message: abonne ? "Abonnée à toutes les alertes." : "Désabonnée de toutes les alertes." };
}

export async function activerAlerte(alerte: string, actif: boolean): Promise<Retour> {
  const u = await currentUser();
  const def = alerteDe(alerte);
  if (!def) return { ok: false, erreur: "Alerte inconnue." };
  await q(
    `insert into alertes_reglages(cle, actif, maj_par) values($1,$2,$3) on conflict (cle) do update set actif=$2, maj_par=$3, maj_le=now()`,
    [alerte, actif, u.nom],
  );
  rafraichir();
  return { ok: true, message: `« ${def.titre} » ${actif ? "activée" : "désactivée pour tout le monde"}.` };
}

/** Le texte d'une alerte au texte neutre : enregistré par l'équipe, il est validé ; vidé, le texte de départ revient. */
export async function enregistrerTexte(alerte: string, objet: string, corps: string): Promise<Retour> {
  const u = await currentUser();
  const def = alerteDe(alerte);
  if (!def?.depart) return { ok: false, erreur: "Le texte de cette alerte vient du code de l'espace client : il ne se modifie pas ici." };
  const texte = corps.replace(/\r\n/g, "\n").trim();
  if (texte.length > 4000 || objet.length > 200) return { ok: false, erreur: "Texte trop long." };
  const inconnues = [...`${objet} ${texte}`.matchAll(/\{([a-z_]+)\}/gi)].map((x) => x[1]).filter((v) => !def.variables.includes(v));
  if (inconnues.length) return { ok: false, erreur: `Variable inconnue : {${inconnues[0]}}. Celles de cette alerte : ${def.variables.map((v) => `{${v}}`).join(" ")}.` };
  await q(
    `insert into alertes_reglages(cle, objet, corps, valide, maj_par) values($1,$2,$3,$4,$5)
     on conflict (cle) do update set objet=$2, corps=$3, valide=$4, maj_par=$5, maj_le=now()`,
    [alerte, objet.trim() || null, texte || null, !!texte, u.nom],
  );
  rafraichir();
  return { ok: true, message: texte ? "Texte enregistré et validé." : "Texte vidé : le texte neutre de départ revient." };
}

const EXEMPLE: Record<string, unknown> = {
  client: "Madame Exemple", reference: "BD-2026-0001", piece: "Justificatif de domicile", trajet: "Paris → Lyon", numero: "DV-2026-0001",
  origine: "par le lien de signature", date: "lundi 9 novembre à 10:00", montant: "1 234,00 €", libelle: "Arrhes 30 % · devis DV-2026-0001",
  relance: "Relance de devis", motif: "pas d'adresse e-mail", modele: "Relance de devis", destinataire: "client@exemple.fr",
};
const EXEMPLES_CODE: Record<string, Record<string, unknown>> = {
  cartons_demandes_equipe: { client: "Madame Exemple", reference: "BD-2026-0001", jour: "samedi 14 novembre", adresse: "1 rue de l'Exemple, 75001 Paris", contact: "Camille Exemple", telephone_contact: "06 00 00 00 00", chemin: "/dashboard/espace-client/cartons" },
  avarie_equipe: { client: "Madame Exemple", reference: "BD-2026-0001", numero: "SAV-2026-001", reserves: true, date_constat: "12/11/2026", objets: "Une table basse", description: "Pied rayé.", nb_photos: 2, chemin: "/dashboard/espace-client" },
  service_demande: { client: "Madame Exemple", reference: "BD-2026-0001", service: "Garde-meuble", telephone_client: "06 00 00 00 00", email: "client@exemple.fr" },
  recap_cartons_equipe: { jour: "samedi 14 novembre", total: 30, incomplets: 0, lignes: [{ ordre: 1, creneau: "9 h 00 – 10 h 00", client: "Camille Exemple", reference: "BD-2026-0001", adresse: "1 rue de l'Exemple, 75001 Paris", nb: 30 }], chemin: "/dashboard/espace-client/cartons" },
};

/** L'aperçu d'une alerte, rendu comme à l'envoi, avec des valeurs d'exemple (et, au choix, un texte en cours de saisie). */
export async function apercuAlerte(alerte: string, saisie?: { objet: string; corps: string }): Promise<{ ok: true; sujet: string; html: string } | { ok: false; erreur: string }> {
  await currentUser();
  const def = alerteDe(alerte);
  if (!def) return { ok: false, erreur: "Alerte inconnue." };
  const lien = "#desabonnement";
  if (def.texteCode) {
    const base = (process.env.ESPACE_CLIENT_URL || process.env.NEXT_PUBLIC_URL_EXTERNE || "").replace(/\/$/, "");
    const r = rendreEmail(def.texteCode, { ...EXEMPLES_CODE[def.texteCode], signature: { nom: "Espace client", role: "Message automatique", telephone: TEL_AGENCE }, desabonnement: lien }, base);
    return { ok: true, sujet: r.sujet, html: r.html };
  }
  const etat = await lireEtat(q);
  const reglage = saisie ? { actif: true, objet: saisie.objet, corps: saisie.corps, valide: false, maj_par: null, maj_le: null } : (etat?.reglages.get(alerte) ?? null);
  const m = await composerAlerte(def, reglage, EXEMPLE, { chemin: "/parcours", libelle: "Ouvrir le dossier" }, lien);
  return { ok: true, sujet: m.sujet, html: m.html };
}

/** Le désabonnement par le lien d'un e-mail : sans connexion, le jeton signé fait foi. */
export async function desabonnerParJeton(jeton: string, abonne = false): Promise<Retour> {
  const j = lireJeton(jeton);
  if (!j) return { ok: false, erreur: "Ce lien n'est pas valide." };
  await q(
    `insert into alertes_abonnements(email, alerte, abonne, par) values($1,$2,$3,'lien de désabonnement')
     on conflict (email, alerte) do update set abonne=$3, par='lien de désabonnement', maj_le=now()`,
    [j.email, j.alerte, abonne],
  );
  revalidatePath("/relances/alertes");
  const titre = alerteDe(j.alerte)!.titre;
  return { ok: true, message: abonne ? `${j.email} est de nouveau abonnée à « ${titre} ».` : `${j.email} ne recevra plus l'alerte « ${titre} ».` };
}
