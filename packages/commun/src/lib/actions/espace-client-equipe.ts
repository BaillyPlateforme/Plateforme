"use server";

import { revalidatePath } from "next/cache";
import { annulerLiens, envoyerLienAuClient } from "@/lib/espace-client/acces";
import { AdresseDejaPrise, changerAdresseDuCompte, verifierAdresseLibre } from "@/lib/espace-client/comptes";
import { estDemo } from "@/lib/espace-client/config";
import { devisDeLaDemande } from "@/lib/espace-client/demandes";
import { depot, lireDonnees, maintenant, nouvelId } from "@/lib/espace-client/depot";
import { exigerEquipe, type Equipe } from "@/lib/espace-client/equipe";
import { cheminFichier, deposerFichier, octets, retirerFichier } from "@/lib/espace-client/fichiers";
import { aujourdhui, salutation } from "@/lib/espace-client/format";
import { conseillerDe, signatureDe } from "@/lib/espace-client/lectures";
import { notifier } from "@/lib/espace-client/notifier";
import { outilMetier } from "@/lib/espace-client/outil-metier";
import { prochainNumeroFacture } from "@/lib/espace-client/paiement";
import { calculerTourneeDuSamedi, envoyerCreneauxDuSamedi } from "@/lib/espace-client/samedi";
import { erreursDe, TYPES_DOCUMENTS, verifierFichier, type Erreurs } from "@/lib/espace-client/schemas";
import {
  clientSchema, conseillerSchema, conteneurSchema, devisSchema, dossierLieSchema, dossierSchema, factureSchema, lireLignes, pieceSchema, serviceSchema, tutoSchema,
} from "@/lib/espace-client/schemas-equipe";
import { estRelie, facturePayeeCrm, majClientCrm, noterDansLeCrm } from "@/lib/espace-client/crm";
import { segmentDe } from "@/lib/espace-client/segments";
import type { Client, Devis, DocumentFichier, StatutDevis, StatutSav } from "@/lib/espace-client/types";

/*
 * Les actions de l'équipe. Une action serveur répond depuis n'importe quelle
 * adresse : le garde de /dashboard ne la protège pas. Chacune commence donc
 * par `exigerEquipe()` — une session Supabase d'un compte de l'équipe, ni RH
 * ni client (ou le back-office de démonstration, sur données fictives en
 * mémoire). Elles lisent tout et écrivent par la clé de service : l'équipe
 * tient tous les dossiers.
 *
 * Elles rendent un résultat plutôt que de lever : l'écran l'affiche.
 */

export type Resultat = { ok: true; message?: string; id?: string; apercu?: string | null } | { ok: false; erreur?: string; erreurs?: Erreurs };

async function garde(fn: (equipe: Equipe) => Promise<Resultat>): Promise<Resultat> {
  try {
    const equipe = await exigerEquipe();
    const r = await fn(equipe);
    revalidatePath("/espace-client", "layout");
    return r;
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

const echec = (erreurs: Erreurs): Resultat => ({ ok: false, erreurs });

const plusJours = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Le message d'erreur si l'adresse appartient à un compte de l'équipe ou RH ; null si elle est libre. */
async function adresseRefusee(email: string): Promise<string | null> {
  if (estDemo()) return null;
  try {
    await verifierAdresseLibre(email);
    return null;
  } catch (e) {
    if (e instanceof AdresseDejaPrise) return e.message;
    throw e;
  }
}

/** L'aperçu du message envoyé : en démonstration seulement (en base, il est au journal). */
const apercuDe = (id: string) => (estDemo() ? id : null);

/** Les devis et factures d'un dossier relié vivent dans le CRM : on y renvoie. */
const VIENT_DU_CRM = "Ce dossier est relié au CRM : ses devis et ses factures s'établissent dans la fiche du dossier CRM, et arrivent ici tout seuls.";

/** Le dépôt d'un fichier de l'équipe dans un dossier, sans e-mail : la ligne du document. */
async function deposerPourLEquipe(dossierId: string, fichier: File, libelle: string, categorie: string, equipe: Equipe): Promise<DocumentFichier> {
  const chemin = cheminFichier(dossierId, fichier.name);
  await deposerFichier(chemin, await octets(fichier), fichier.type);
  const doc: DocumentFichier = {
    id: nouvelId(), dossier_id: dossierId, categorie, libelle, source: "equipe", chemin, nom_fichier: fichier.name,
    taille_octets: fichier.size, mime: fichier.type, requirement_id: null, created_by: equipe.nom, created_at: maintenant(),
  };
  await depot().inserer("documents", doc);
  return doc;
}

// --- Dossiers ----------------------------------------------------------------------------------

export type NouveauDossier = {
  client: Record<string, unknown>;
  dossier: Record<string, unknown>;
  importerDevis: boolean;
  envoyerAcces: boolean;
};

/**
 * Ouvre l'espace d'un client : son dossier, et sa fiche s'il n'en a pas
 * encore. `pieces` : le devis signé (PDF du logiciel de devis), déposé tout
 * de suite dans « Mes documents » — FormData, seul moyen de faire passer un
 * fichier à une action.
 */
export async function creerDossier(entree: NouveauDossier, pieces?: FormData): Promise<Resultat> {
  return garde(async (equipe) => {
    // En base, un dossier naît dans le CRM et son espace s'ouvre depuis sa fiche :
    // un espace sans dossier du CRM aurait ses propres devis et sa propre numérotation.
    if (!estDemo()) return { ok: false, erreur: "Un espace client s'ouvre depuis la fiche d'un dossier du CRM (« Ouvrir l'espace client »)." };
    const c = clientSchema.safeParse(entree.client);
    const x = dossierSchema.safeParse(entree.dossier);
    const f = pieces?.get("devis_pdf");
    const pdf = f instanceof File && f.size > 0 ? f : null;
    const errPdf = pdf ? verifierFichier(pdf, ["application/pdf"]) : null;
    if (!c.success || !x.success || errPdf) {
      return echec({
        ...(c.success ? {} : Object.fromEntries(Object.entries(erreursDe(c.error)).map(([k, v]) => [`client.${k}`, v]))),
        ...(x.success ? {} : Object.fromEntries(Object.entries(erreursDe(x.error)).map(([k, v]) => [`dossier.${k}`, v]))),
        ...(errPdf ? { devis_pdf: errPdf } : {}),
      });
    }
    const avant = await lireDonnees();
    if (!avant.conseillers.some((k) => k.id === c.data.conseiller_id)) return echec({ "client.conseiller_id": "Choisissez un conseiller (Réglages pour en ajouter un)." });
    if (x.data.request_id) {
      const deja = avant.dossiers.find((y) => y.request_id === x.data.request_id);
      if (deja) return { ok: false, erreur: `Cette demande a déjà son espace client : le dossier ${deja.reference}.` };
    }
    // Une adresse de l'équipe ou d'un compte RH ne peut pas devenir celle d'un client.
    const prise = await adresseRefusee(c.data.email);
    if (prise) return echec({ "client.email": prise });

    // L'estimation de la demande devient le devis du dossier, si on le demande et si Supabase répond.
    let devisImportes: Omit<Devis, "id" | "dossier_id" | "numero">[] = [];
    let numerosImportes: string[] = [];
    let avertissement = "";
    // Sans session réelle (démonstration), on ne lit rien de la base des demandes.
    if (entree.importerDevis && x.data.request_id && !equipe.demo) {
      try {
        const lus = await devisDeLaDemande(x.data.request_id);
        numerosImportes = lus.map((v) => v.reference);
        devisImportes = lus.map((v) => ({
          formule: x.data.formule,
          lignes: (v.lignes ?? []).map((l) => ({ libelle: l.label, montant_ht: Number(l.amount) || 0, ...(l.detail ? { detail: l.detail } : {}) })),
          inclus: [],
          montant_ht: Number(v.montant_ht) || 0,
          montant_ttc: Number(v.montant_ttc) || 0,
          arrhes_pourcentage: c.data.type === "particulier" ? 30 : 0,
          statut: "envoye",
          emis_le: v.created_at.slice(0, 10),
          valide_jusqu_au: v.valid_until?.slice(0, 10) ?? plusJours(aujourdhui(), 30),
          accepte_le: null,
        }));
        if (!lus.length) avertissement = " Aucune estimation à reprendre pour cette demande.";
      } catch (e) {
        avertissement = ` L'estimation n'a pas pu être reprise (${e instanceof Error ? e.message : "lecture impossible"}) : ajoutez le devis depuis la fiche.`;
      }
    }

    // Le client : celui de cette adresse s'il existe déjà, sinon une nouvelle fiche.
    const reglages = c.data.type === "particulier" ? { masquer_devis: false, masquer_factures: false } : { masquer_devis: c.data.masquer_devis, masquer_factures: c.data.masquer_factures };
    let client: Client | undefined = avant.clients.find((k) => k.email === c.data.email);
    if (!client) {
      client = { id: nouvelId(), ...c.data, ...reglages, auth_user_id: null, sessions_revoquees_le: null, demo: false, created_at: maintenant() };
      await depot().inserer("clients", client);
    }

    const reference = await depot().prochainNumero("dossiers", `BD-${x.data.periode_debut.slice(0, 4)}-`, 4);
    const id = nouvelId();
    await depot().inserer("dossiers", {
      id, client_id: client.id, reference, request_id: x.data.request_id,
      ville_depart: x.data.ville_depart, ville_arrivee: x.data.ville_arrivee, adresse_depart: x.data.adresse_depart, adresse_arrivee: x.data.adresse_arrivee,
      periode_debut: x.data.periode_debut, periode_fin: x.data.periode_fin, portee: x.data.portee, mode_transport: x.data.mode_transport,
      pays_destination: x.data.pays_destination, statut: x.data.statut, volume_m3: x.data.volume_m3, formule: x.data.formule, logement: x.data.logement,
      compagnie: null, numero_conteneur: null, url_tracking: null, statut_conteneur: null, navire: null, port_depart: null, port_arrivee: null, eta: null,
      cartons_non_necessaires: false, photo: x.data.photo, termine_le: null, avis_demande_le: null, created_at: maintenant(),
    });
    // Le numéro de l'estimation reste le sien ; à défaut, celui du dossier.
    await depot().inserer(
      "devis",
      devisImportes.map((v, i) => ({ id: nouvelId(), dossier_id: id, numero: numerosImportes[i] || `DV-${reference.slice(3)}-${i + 1}`, ...v })),
    );
    if (pdf) await deposerPourLEquipe(id, pdf, "Devis signé", "devis", equipe);

    let apercu: string | null = null;
    let accesMessage = "";
    if (entree.envoyerAcces) {
      try {
        apercu = (await envoyerLienAuClient(client, { reference })).id;
        accesMessage = " Lien d'accès envoyé.";
      } catch (e) {
        accesMessage = ` Le lien d'accès n'est pas parti : ${e instanceof Error ? e.message : "erreur inconnue"}`;
      }
    }
    return { ok: true, id, apercu: apercu && apercuDe(apercu), message: `Dossier ${reference} créé.${pdf ? " Devis déposé dans ses documents." : ""}${accesMessage}${avertissement}` };
  });
}

export async function modifierDossier(id: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const dossier = await depot().trouver("dossiers", id);
    if (!dossier) throw new Error("Dossier introuvable.");
    // Relié au CRM : seules les données propres à l'espace se modifient ici.
    if (estRelie(dossier)) {
      const l = dossierLieSchema.safeParse(entree);
      if (!l.success) return echec(erreursDe(l.error));
      const international = dossier.portee === "international";
      if (international && l.data.pays_destination === "FR") return echec({ pays_destination: "Choisissez le pays de destination : il fixe les pièces à fournir." });
      await depot().modifier("dossiers", id, {
        logement: l.data.logement, photo: l.data.photo, bailleur_nom: l.data.bailleur_nom, bailleur_email: l.data.bailleur_email,
        ...(international ? { pays_destination: l.data.pays_destination, mode_transport: l.data.mode_transport } : {}),
      });
      return { ok: true, message: "Dossier enregistré : son espace est à jour." };
    }
    const x = dossierSchema.safeParse(entree);
    if (!x.success) return echec(erreursDe(x.error));
    if (!(await depot().modifier("dossiers", id, { ...x.data, request_id: x.data.request_id ?? dossier.request_id }))) throw new Error("Dossier introuvable.");
    return { ok: true, message: "Dossier enregistré." };
  });
}

export async function modifierConteneur(id: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const x = conteneurSchema.safeParse(entree);
    if (!x.success) return echec(erreursDe(x.error));
    if (!(await depot().modifier("dossiers", id, x.data))) throw new Error("Dossier introuvable.");
    return { ok: true, message: "Suivi du conteneur enregistré." };
  });
}

/** Coordonnées du client et réglages grand compte : le masquage n'a de sens que pour un grand compte. */
export async function modifierClient(dossierId: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const c = clientSchema.safeParse(entree);
    if (!c.success) return echec(erreursDe(c.error));
    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    const client = dossier && d.clients.find((k) => k.id === dossier.client_id);
    if (!client) throw new Error("Client introuvable.");
    if (d.clients.some((k) => k.id !== client.id && k.email === c.data.email)) return echec({ email: "Cette adresse est déjà celle d'un autre client." });
    // L'adresse de connexion suit l'adresse du client, si elle change — et jamais vers le compte de quelqu'un d'autre.
    if (c.data.email !== client.email) {
      const prise = await adresseRefusee(c.data.email);
      if (prise) return echec({ email: prise });
      if (!estDemo()) await changerAdresseDuCompte(client, c.data.email);
    }
    // Le masquage suit le segment : jamais pour qui paie lui-même, toujours pour un militaire,
    // au choix de l'équipe pour un grand compte.
    const masquage = segmentDe(c.data.type).masquage;
    const reglages = masquage === "jamais" ? { masquer_devis: false, masquer_factures: false } : masquage === "toujours" ? { masquer_devis: true, masquer_factures: true } : {};
    await depot().modifier("clients", client.id, { ...c.data, ...reglages });
    // Relié au CRM : les coordonnées et le segment s'y écrivent aussi, le CRM les tient.
    if (estRelie(dossier)) {
      await majClientCrm(dossier.crm_dossier_id!, { ...c.data });
      return { ok: true, message: "Client enregistré dans le CRM et dans son espace." };
    }
    return { ok: true, message: "Client enregistré : son espace est à jour." };
  });
}

export async function envoyerAcces(dossierId: string): Promise<Resultat> {
  return garde(async () => {
    const dossier = await depot().trouver("dossiers", dossierId);
    const client = dossier && (await depot().trouver("clients", dossier.client_id));
    if (!dossier || !client) throw new Error("Dossier introuvable.");
    const n = await envoyerLienAuClient(client, { reference: dossier.reference });
    await noterDansLeCrm(dossier.crm_dossier_id, `Lien d'accès à l'espace client ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email}`);
    return { ok: true, apercu: apercuDe(n.id), message: `Lien d'accès ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email}.` };
  });
}

/**
 * Coupe toutes les sessions ouvertes du client — un lien transféré par
 * erreur, un téléphone perdu — et les liens pas encore utilisés. Effet
 * immédiat : la base ne rend plus rien à une session ouverte avant cet
 * instant, même si son jeton n'a pas expiré.
 */
export async function revoquerSessions(dossierId: string): Promise<Resultat> {
  return garde(async () => {
    const dossier = await depot().trouver("dossiers", dossierId);
    if (!dossier) throw new Error("Client introuvable.");
    await depot().modifier("clients", dossier.client_id, { sessions_revoquees_le: maintenant() });
    await annulerLiens(dossier.client_id);
    return { ok: true, message: "Sessions coupées : le client devra demander un nouveau lien." };
  });
}

/** La fin de chantier signée : le dossier passe à « terminé », et la demande d'avis part une fois. */
export async function marquerRealise(dossierId: string): Promise<Resultat> {
  return garde(async () => {
    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    const client = dossier && d.clients.find((k) => k.id === dossier.client_id);
    if (!dossier || !client) throw new Error("Dossier introuvable.");
    const dejaDemande = !!dossier.avis_demande_le;
    const avis = dejaDemande ? null : await outilMetier.demanderAvis(dossierId);
    await depot().modifier("dossiers", dossierId, {
      statut: "termine",
      termine_le: dossier.termine_le ?? maintenant(),
      ...(dejaDemande ? {} : { avis_demande_le: maintenant() }),
    });
    // La demande d'avis (cahier des charges, §3.9) : une par dossier — la clé l'assure même sur deux clics simultanés.
    const n = dejaDemande
      ? null
      : await notifier.envoyer(
          {
            dossier_id: dossierId, canal: "email", modele: "demande_avis", destinataire: client.email,
            payload: { salutation: salutation(client), trajet: `${dossier.ville_depart} → ${dossier.ville_arrivee}`, lien_avis: avis?.lien ?? null, signature: signatureDe(conseillerDe(d, client.conseiller_id)) },
          },
          // Sans lien de dépôt d'avis, le message dirait « le lien sera fourni par l'outil métier » : il reste au journal.
          { cle: `ec:demande-avis:${dossierId}`, retenu: avis?.lien ? null : "Demande d'avis retenue : aucun lien de dépôt d'avis (outil métier non branché, ESPACE_CLIENT_LIEN_AVIS absent)." },
        );
    const partie = n?.statut === "envoyee";
    await noterDansLeCrm(dossier.crm_dossier_id, `Fin de chantier signée (espace client)${n ? (partie ? " · demande d'avis envoyée" : " · demande d'avis journalisée (non envoyée)") : ""}`);
    return {
      ok: true,
      apercu: n ? apercuDe(n.id) : null,
      message: !n ? "Dossier terminé (la demande d'avis était déjà partie)." : partie ? "Dossier terminé : la demande d'avis est partie." : `Dossier terminé : la demande d'avis est au journal, non envoyée (${n.erreur ?? "envoi désactivé"}).`,
    };
  });
}

// --- Documents ---------------------------------------------------------------------------------

/** Le dépôt d'un document par l'équipe, et l'e-mail qui prévient le client. */
export async function deposerDocumentEquipe(dossierId: string, fd: FormData): Promise<Resultat> {
  return garde(async (equipe) => {
    const f = fd.get("fichier");
    const fichier = f instanceof File ? f : null;
    const libelle = String(fd.get("libelle") ?? "").trim().slice(0, 120);
    const categorie = String(fd.get("categorie") ?? "autre").slice(0, 40);
    const erreurs: Erreurs = {};
    if (libelle.length < 3) erreurs.libelle = "Donnez un nom au document (3 caractères au moins).";
    const e = verifierFichier(fichier, TYPES_DOCUMENTS);
    if (e) erreurs.fichier = e;
    if (Object.keys(erreurs).length) return echec(erreurs);

    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    const client = dossier && d.clients.find((k) => k.id === dossier.client_id);
    if (!dossier || !client) throw new Error("Dossier introuvable.");
    await deposerPourLEquipe(dossierId, fichier!, libelle, categorie, equipe);
    const n = await notifier.envoyer({
      dossier_id: dossierId, canal: "email", modele: "document_depose", destinataire: client.email,
      payload: { salutation: salutation(client), document: libelle, chemin: `/espace-client/${dossier.reference}/documents#equipe`, signature: signatureDe(conseillerDe(d, client.conseiller_id)) },
    });
    return { ok: true, apercu: apercuDe(n.id), message: `« ${libelle} » déposé : le client est prévenu par e-mail${n.statut === "envoyee" ? "" : " (journalisé)"}.` };
  });
}

export async function supprimerDocument(documentId: string): Promise<Resultat> {
  return garde(async () => {
    const doc = await depot().trouver("documents", documentId);
    if (doc) {
      await depot().supprimer("documents", documentId);
      await retirerFichier(doc.chemin);
    }
    return { ok: true, message: "Document retiré." };
  });
}

// --- Devis et factures -------------------------------------------------------------------------

export async function ajouterDevis(dossierId: string, entree: { formule: string; lignes: string; inclus: string; arrhes_pourcentage: string; valide_jusqu_au: string; statut: string }): Promise<Resultat> {
  return garde(async () => {
    const r = devisSchema.safeParse({ ...entree, lignes: lireLignes(entree.lignes ?? "") });
    if (!r.success) return echec(erreursDe(r.error));
    const v = r.data;
    const ht = Math.round(v.lignes.reduce((n, l) => n + l.montant_ht, 0) * 100) / 100;
    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    if (!dossier) throw new Error("Dossier introuvable.");
    if (estRelie(dossier)) return { ok: false, erreur: VIENT_DU_CRM };
    const rang = d.devis.filter((x) => x.dossier_id === dossierId).length + 1;
    await depot().inserer("devis", {
      id: nouvelId(), dossier_id: dossierId, numero: `DV-${dossier.reference.slice(3)}-${rang}`, formule: v.formule, lignes: v.lignes, inclus: v.inclus,
      montant_ht: ht, montant_ttc: Math.round(ht * 120) / 100, arrhes_pourcentage: v.arrhes_pourcentage, statut: v.statut,
      emis_le: aujourdhui(), valide_jusqu_au: v.valide_jusqu_au, accepte_le: v.statut === "accepte" ? aujourdhui() : null,
    });
    return { ok: true, message: "Devis ajouté : il apparaît dans l'espace du client." };
  });
}

export async function changerStatutDevis(devisId: string, statut: StatutDevis): Promise<Resultat> {
  return garde(async () => {
    if (!["envoye", "accepte", "refuse", "expire"].includes(statut)) throw new Error("Statut inconnu.");
    const v = await depot().trouver("devis", devisId);
    if (!v) throw new Error("Devis introuvable.");
    if (typeof v.crm_devis_id === "number") return { ok: false, erreur: VIENT_DU_CRM };
    await depot().modifier("devis", devisId, { statut, accepte_le: statut === "accepte" ? (v.accepte_le ?? aujourdhui()) : null });
    return { ok: true, message: "Devis mis à jour." };
  });
}

export async function ajouterFacture(dossierId: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = factureSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    if (!dossier) throw new Error("Dossier introuvable.");
    if (estRelie(dossier)) return { ok: false, erreur: VIENT_DU_CRM };
    const retenu = d.devis.filter((x) => x.dossier_id === dossierId && x.statut === "accepte").sort((a, b) => b.emis_le.localeCompare(a.emis_le))[0];
    await depot().inserer("factures", {
      id: nouvelId(), dossier_id: dossierId, devis_id: r.data.type === "garde_meubles" ? null : (retenu?.id ?? null), numero: await prochainNumeroFacture(),
      type: r.data.type, libelle: r.data.libelle, montant_ttc: r.data.montant_ttc, statut: "a_payer", emise_le: aujourdhui(), echeance: r.data.echeance,
      periode: r.data.periode, payee_le: null, paiement_ref: null,
    });
    return { ok: true, message: "Facture émise : le client peut la régler en ligne." };
  });
}

/** Un règlement reçu hors ligne (virement, chèque). */
export async function marquerFacturePayee(factureId: string): Promise<Resultat> {
  return garde(async () => {
    const f = await depot().trouver("factures", factureId);
    if (!f) throw new Error("Facture introuvable.");
    // Une facture du CRM se règle dans le CRM : il la marque payée, et l'espace suit.
    if (typeof f.crm_facture_id === "number") {
      await facturePayeeCrm(f.crm_facture_id, "HORS-LIGNE");
      return { ok: true, message: "Facture marquée réglée dans le CRM et dans l'espace du client." };
    }
    await depot().modifier("factures", factureId, { statut: "payee", payee_le: aujourdhui(), paiement_ref: f.paiement_ref ?? "HORS-LIGNE" });
    return { ok: true, message: "Facture marquée réglée." };
  });
}

// --- Pièces par destination --------------------------------------------------------------------

export async function enregistrerPiece(id: string | null, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = pieceSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    const existe = id ? await depot().trouver("document_requirements", id) : null;
    if (existe) await depot().modifier("document_requirements", existe.id, r.data);
    else await depot().inserer("document_requirements", { id: nouvelId(), ...r.data });
    return { ok: true, message: `« ${r.data.libelle} » enregistrée : les listes des dossiers concernés sont à jour.` };
  });
}

export async function supprimerPiece(id: string): Promise<Resultat> {
  return garde(async () => {
    await depot().supprimer("document_requirements", id);
    return { ok: true, message: "Pièce retirée des listes." };
  });
}

// --- Cartons -----------------------------------------------------------------------------------

export async function enregistrerNbCartons(valeurs: Record<string, number | null>): Promise<Resultat> {
  return garde(async () => {
    const d = await lireDonnees();
    for (const [id, n] of Object.entries(valeurs)) {
      const l = d.livraisons_cartons.find((x) => x.id === id);
      if (!l) continue;
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > 500)) continue;
      await depot().modifier("livraisons_cartons", id, { nb_cartons: n || null, ...(n && l.statut === "demandee" ? { statut: "confirmee" as const } : {}) });
    }
    return { ok: true, message: "Nombres de cartons enregistrés." };
  });
}

export async function calculerTournee(samedi: string): Promise<Resultat> {
  return garde(async () => {
    const r = await calculerTourneeDuSamedi(samedi);
    return { ok: true, message: `Tournée calculée : ${r.arrets} arrêt${r.arrets > 1 ? "s" : ""}, ${String(r.distanceKm).replace(".", ",")} km, fin vers ${r.fin.replace(":", " h ")}.${r.horsTournee ? ` ${r.horsTournee} livraison(s) hors tournée.` : ""}` };
  });
}

export async function envoyerCreneaux(samedi: string): Promise<Resultat> {
  return garde(async () => {
    const r = await envoyerCreneauxDuSamedi(samedi);
    if (!r.prevenus) return { ok: true, message: "Aucun message à envoyer : tous sont déjà partis, ou il manque un créneau ou un nombre de cartons." };
    const s = r.prevenus > 1 ? "s" : "";
    // Ce qui est vraiment parti : en recette ou envoi désactivé, les messages restent au journal.
    return {
      ok: true,
      message:
        r.partis === r.prevenus * 2
          ? `${r.prevenus} client${s} prévenu${s} (SMS et e-mail).`
          : `${r.prevenus} client${s} traité${s} : ${r.partis} message${r.partis > 1 ? "s" : ""} parti${r.partis > 1 ? "s" : ""} sur ${r.prevenus * 2}${r.echecs ? `, ${r.echecs} en échec` : ""} — les autres sont au journal des messages.`,
    };
  });
}

export async function marquerCartonsLivres(samedi: string): Promise<Resultat> {
  return garde(async () => {
    const d = await lireDonnees();
    for (const l of d.livraisons_cartons) if (l.date_samedi === samedi && l.nb_cartons && l.statut !== "livree") await depot().modifier("livraisons_cartons", l.id, { statut: "livree" });
    return { ok: true, message: "Livraisons du samedi marquées livrées." };
  });
}

// --- SAV ---------------------------------------------------------------------------------------

export async function changerStatutSav(id: string, statut: StatutSav): Promise<Resultat> {
  return garde(async () => {
    if (!["recue", "en_analyse", "cloturee"].includes(statut)) throw new Error("Statut inconnu.");
    if (!(await depot().modifier("sav_declarations", id, { statut }))) throw new Error("Déclaration introuvable.");
    return { ok: true, message: "Déclaration mise à jour : le client voit le nouveau statut." };
  });
}

// --- Réglages : conseillers, tutos, services -----------------------------------------------------

export async function ajouterConseiller(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = conseillerSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await depot().inserer("conseillers", { id: nouvelId(), ...r.data, demo: false });
    return { ok: true, message: `${r.data.prenom} ${r.data.nom} ajouté(e).` };
  });
}

export async function supprimerConseiller(id: string): Promise<Resultat> {
  return garde(async () => {
    const d = await lireDonnees();
    if (d.clients.some((c) => c.conseiller_id === id)) return { ok: false, erreur: "Ce conseiller suit encore des clients : réattribuez-les d'abord." };
    await depot().supprimer("conseillers", id);
    return { ok: true, message: "Conseiller retiré." };
  });
}

export async function ajouterTuto(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = tutoSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    const d = await lireDonnees();
    await depot().inserer("tutos", { id: nouvelId(), ...r.data, duree_min: Math.max(1, r.data.etapes.length), image: "/espace-client/interieur-2.jpg", ordre: d.tutos.length + 1, actif: true });
    return { ok: true, message: "Tuto publié dans tous les espaces." };
  });
}

export async function ajouterService(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = serviceSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    const d = await lireDonnees();
    await depot().inserer("services", { id: nouvelId(), ...r.data, ordre: d.services.length + 1, actif: true });
    return { ok: true, message: "Service ajouté à « Mes services complémentaires »." };
  });
}

export async function basculerContenu(type: "tutos" | "services", id: string): Promise<Resultat> {
  return garde(async () => {
    const ligne = await depot().trouver(type, id);
    if (ligne) await depot().modifier(type, id, { actif: !ligne.actif });
    return { ok: true };
  });
}

export async function reinitialiserDemoEquipe(): Promise<Resultat> {
  return garde(async () => {
    if (!estDemo()) throw new Error("Les données réelles ne se réinitialisent pas.");
    await depot().reinitialiser();
    return { ok: true, message: "Démonstration remise à son état de départ." };
  });
}
