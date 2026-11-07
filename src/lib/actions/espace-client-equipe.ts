"use server";

import { revalidatePath } from "next/cache";
import { envoyerLienAuClient } from "@/lib/espace-client/acces";
import { estDemo } from "@/lib/espace-client/config";
import { devisDeLaDemande } from "@/lib/espace-client/demandes";
import { depot, lireDonnees, maintenant, modifierDonnees, nouvelId } from "@/lib/espace-client/depot";
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
  clientSchema, conseillerSchema, conteneurSchema, devisSchema, dossierSchema, factureSchema, lireLignes, pieceSchema, serviceSchema, tutoSchema,
} from "@/lib/espace-client/schemas-equipe";
import type { Client, Devis, Donnees, StatutDevis, StatutSav } from "@/lib/espace-client/types";

/*
 * Les actions de l'équipe. Une action serveur répond depuis n'importe quelle
 * adresse : le garde de /dashboard ne la protège pas. Chacune commence donc
 * par `exigerEquipe()` — une session Supabase de la plateforme, sans le rôle
 * RH (ou le back-office de démonstration, sur données fictives).
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

/** Le prochain numéro de dossier de l'année : BD-2026-0164. */
function prochaineReference(d: Donnees, annee: string) {
  const max = d.dossiers
    .map((x) => /^BD-(\d{4})-(\d+)$/.exec(x.reference))
    .filter((m): m is RegExpExecArray => !!m && m[1] === annee)
    .reduce((n, m) => Math.max(n, Number(m[2])), 0);
  return `BD-${annee}-${String(max + 1).padStart(4, "0")}`;
}

const plusJours = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// --- Dossiers ----------------------------------------------------------------------------------

export type NouveauDossier = {
  client: Record<string, unknown>;
  dossier: Record<string, unknown>;
  importerDevis: boolean;
  envoyerAcces: boolean;
};

export async function creerDossier(entree: NouveauDossier): Promise<Resultat> {
  return garde(async (equipe) => {
    const c = clientSchema.safeParse(entree.client);
    const x = dossierSchema.safeParse(entree.dossier);
    if (!c.success || !x.success) {
      return echec({
        ...(c.success ? {} : Object.fromEntries(Object.entries(erreursDe(c.error)).map(([k, v]) => [`client.${k}`, v]))),
        ...(x.success ? {} : Object.fromEntries(Object.entries(erreursDe(x.error)).map(([k, v]) => [`dossier.${k}`, v]))),
      });
    }
    const avant = await lireDonnees();
    if (!avant.conseillers.some((k) => k.id === c.data.conseiller_id)) return echec({ "client.conseiller_id": "Choisissez un conseiller (Réglages pour en ajouter un)." });

    // L'estimation de la demande devient le devis du dossier, si on le demande et si Supabase répond.
    let devisImportes: Omit<Devis, "id" | "dossier_id">[] = [];
    let avertissement = "";
    // Sans session réelle (démonstration), on ne lit rien de la base des demandes.
    if (entree.importerDevis && x.data.request_id && !equipe.demo) {
      try {
        const lus = await devisDeLaDemande(x.data.request_id);
        devisImportes = lus.map((v) => ({
          numero: v.reference,
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

    const { id, reference, client } = await modifierDonnees((m) => {
      let client: Client | undefined = m.clients.find((k) => k.email.toLowerCase() === c.data.email);
      const reglages = c.data.type === "particulier" ? { masquer_devis: false, masquer_factures: false } : { masquer_devis: c.data.masquer_devis, masquer_factures: c.data.masquer_factures };
      if (!client) {
        client = { id: nouvelId("cl"), ...c.data, ...reglages, version_acces: 0, created_at: maintenant() };
        m.clients.push(client);
      }
      const reference = prochaineReference(m, x.data.periode_debut.slice(0, 4));
      const id = nouvelId("do");
      m.dossiers.push({
        id, client_id: client.id, reference, request_id: x.data.request_id,
        ville_depart: x.data.ville_depart, ville_arrivee: x.data.ville_arrivee, adresse_depart: x.data.adresse_depart, adresse_arrivee: x.data.adresse_arrivee,
        periode_debut: x.data.periode_debut, periode_fin: x.data.periode_fin, portee: x.data.portee, mode_transport: x.data.mode_transport,
        pays_destination: x.data.pays_destination, statut: x.data.statut, volume_m3: x.data.volume_m3, formule: x.data.formule, logement: x.data.logement,
        compagnie: null, numero_conteneur: null, url_tracking: null, statut_conteneur: null, navire: null, port_depart: null, port_arrivee: null, eta: null,
        cartons_non_necessaires: false, photo: x.data.photo, termine_le: null, avis_demande_le: null, created_at: maintenant(),
      });
      for (const v of devisImportes) m.devis.push({ id: nouvelId("dv"), dossier_id: id, ...v });
      return { id, reference, client: { ...client } };
    });

    let apercu: string | null = null;
    if (entree.envoyerAcces) apercu = (await envoyerLienAuClient(client, { reference })).id;
    return { ok: true, id, apercu: estDemo() ? apercu : null, message: `Dossier ${reference} créé.${entree.envoyerAcces ? " Lien d'accès envoyé." : ""}${avertissement}` };
  });
}

export async function modifierDossier(id: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const x = dossierSchema.safeParse(entree);
    if (!x.success) return echec(erreursDe(x.error));
    await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === id);
      if (!dossier) throw new Error("Dossier introuvable.");
      Object.assign(dossier, x.data, { request_id: x.data.request_id ?? dossier.request_id });
    });
    return { ok: true, message: "Dossier enregistré." };
  });
}

export async function modifierConteneur(id: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const x = conteneurSchema.safeParse(entree);
    if (!x.success) return echec(erreursDe(x.error));
    await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === id);
      if (!dossier) throw new Error("Dossier introuvable.");
      Object.assign(dossier, x.data);
    });
    return { ok: true, message: "Suivi du conteneur enregistré." };
  });
}

/** Coordonnées du client et réglages grand compte : le masquage n'a de sens que pour un grand compte. */
export async function modifierClient(dossierId: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const c = clientSchema.safeParse(entree);
    if (!c.success) return echec(erreursDe(c.error));
    const r = await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === dossierId);
      const client = dossier && m.clients.find((k) => k.id === dossier.client_id);
      if (!client) throw new Error("Client introuvable.");
      if (m.clients.some((k) => k.id !== client.id && k.email.toLowerCase() === c.data.email)) return "doublon";
      const reglages = c.data.type === "particulier" ? { masquer_devis: false, masquer_factures: false } : {};
      Object.assign(client, c.data, reglages);
      return "ok";
    });
    if (r === "doublon") return echec({ email: "Cette adresse est déjà celle d'un autre client." });
    return { ok: true, message: "Client enregistré : son espace est à jour." };
  });
}

export async function envoyerAcces(dossierId: string): Promise<Resultat> {
  return garde(async () => {
    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    const client = dossier && d.clients.find((k) => k.id === dossier.client_id);
    if (!dossier || !client) throw new Error("Dossier introuvable.");
    const n = await envoyerLienAuClient(client, { reference: dossier.reference });
    return { ok: true, apercu: estDemo() ? n.id : null, message: `Lien d'accès ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email}.` };
  });
}

/** Coupe toutes les sessions ouvertes du client : un lien transféré par erreur, un téléphone perdu. */
export async function revoquerSessions(dossierId: string): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === dossierId);
      const client = dossier && m.clients.find((k) => k.id === dossier.client_id);
      if (!client) throw new Error("Client introuvable.");
      client.version_acces += 1;
      m.jetons_acces = m.jetons_acces.filter((j) => j.client_id !== client.id);
    });
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
    await modifierDonnees((m) => {
      const x = m.dossiers.find((y) => y.id === dossierId)!;
      x.statut = "termine";
      x.termine_le = x.termine_le ?? maintenant();
      if (!dejaDemande) x.avis_demande_le = maintenant();
    });
    if (!dejaDemande) {
      await notifier.envoyer({
        dossier_id: dossierId, canal: "email", modele: "demande_avis", destinataire: client.email,
        payload: { salutation: salutation(client), trajet: `${dossier.ville_depart} → ${dossier.ville_arrivee}`, lien_avis: avis?.lien ?? null, signature: signatureDe(conseillerDe(d, client.conseiller_id)) },
      });
    }
    return { ok: true, message: dejaDemande ? "Dossier terminé (la demande d'avis était déjà partie)." : "Dossier terminé : la demande d'avis est partie." };
  });
}

// --- Documents ---------------------------------------------------------------------------------

/** Le dépôt d'un document par l'équipe, et l'e-mail qui prévient le client. */
export async function deposerDocumentEquipe(dossierId: string, fd: FormData): Promise<Resultat> {
  return garde(async (equipe) => {
    const f = fd.get("fichier");
    const fichier = f instanceof File ? f : null;
    const libelle = String(fd.get("libelle") ?? "").trim().slice(0, 120);
    const categorie = String(fd.get("categorie") ?? "autre");
    const erreurs: Erreurs = {};
    if (libelle.length < 3) erreurs.libelle = "Donnez un nom au document (3 caractères au moins).";
    const e = verifierFichier(fichier, TYPES_DOCUMENTS);
    if (e) erreurs.fichier = e;
    if (Object.keys(erreurs).length) return echec(erreurs);

    const d = await lireDonnees();
    const dossier = d.dossiers.find((y) => y.id === dossierId);
    const client = dossier && d.clients.find((k) => k.id === dossier.client_id);
    if (!dossier || !client) throw new Error("Dossier introuvable.");
    const chemin = cheminFichier(dossierId, fichier!.name);
    await deposerFichier(chemin, await octets(fichier!), fichier!.type);
    await modifierDonnees((m) => {
      m.documents.push({
        id: nouvelId("doc"), dossier_id: dossierId, categorie, libelle, source: "equipe", chemin, nom_fichier: fichier!.name,
        taille_octets: fichier!.size, mime: fichier!.type, requirement_id: null, created_by: equipe.nom, created_at: maintenant(),
      });
    });
    const n = await notifier.envoyer({
      dossier_id: dossierId, canal: "email", modele: "document_depose", destinataire: client.email,
      payload: { salutation: salutation(client), document: libelle, chemin: `/espace-client/${dossier.reference}/documents#equipe`, signature: signatureDe(conseillerDe(d, client.conseiller_id)) },
    });
    return { ok: true, apercu: estDemo() ? n.id : null, message: `« ${libelle} » déposé : le client est prévenu par e-mail${n.statut === "envoyee" ? "" : " (journalisé)"}.` };
  });
}

export async function supprimerDocument(documentId: string): Promise<Resultat> {
  return garde(async () => {
    const chemin = await modifierDonnees((m) => {
      const doc = m.documents.find((x) => x.id === documentId);
      m.documents = m.documents.filter((x) => x.id !== documentId);
      return doc?.chemin ?? null;
    });
    if (chemin) await retirerFichier(chemin);
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
    await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === dossierId);
      if (!dossier) throw new Error("Dossier introuvable.");
      const rang = m.devis.filter((x) => x.dossier_id === dossierId).length + 1;
      const numero = `DV-${dossier.reference.slice(3)}-${rang}`;
      m.devis.push({
        id: nouvelId("dv"), dossier_id: dossierId, numero, formule: v.formule, lignes: v.lignes, inclus: v.inclus,
        montant_ht: ht, montant_ttc: Math.round(ht * 120) / 100, arrhes_pourcentage: v.arrhes_pourcentage, statut: v.statut,
        emis_le: aujourdhui(), valide_jusqu_au: v.valide_jusqu_au, accepte_le: v.statut === "accepte" ? aujourdhui() : null,
      });
    });
    return { ok: true, message: "Devis ajouté : il apparaît dans l'espace du client." };
  });
}

export async function changerStatutDevis(devisId: string, statut: StatutDevis): Promise<Resultat> {
  return garde(async () => {
    if (!["envoye", "accepte", "refuse", "expire"].includes(statut)) throw new Error("Statut inconnu.");
    await modifierDonnees((m) => {
      const v = m.devis.find((x) => x.id === devisId);
      if (!v) throw new Error("Devis introuvable.");
      v.statut = statut;
      v.accepte_le = statut === "accepte" ? (v.accepte_le ?? aujourdhui()) : null;
    });
    return { ok: true, message: "Devis mis à jour." };
  });
}

export async function ajouterFacture(dossierId: string, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = factureSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await modifierDonnees((m) => {
      const dossier = m.dossiers.find((y) => y.id === dossierId);
      if (!dossier) throw new Error("Dossier introuvable.");
      const retenu = m.devis.filter((x) => x.dossier_id === dossierId && x.statut === "accepte").sort((a, b) => b.emis_le.localeCompare(a.emis_le))[0];
      m.factures.push({
        id: nouvelId("fa"), dossier_id: dossierId, devis_id: r.data.type === "garde_meubles" ? null : (retenu?.id ?? null), numero: prochainNumeroFacture(m),
        type: r.data.type, libelle: r.data.libelle, montant_ttc: r.data.montant_ttc, statut: "a_payer", emise_le: aujourdhui(), echeance: r.data.echeance,
        periode: r.data.periode, payee_le: null, paiement_ref: null,
      });
    });
    return { ok: true, message: "Facture émise : le client peut la régler en ligne." };
  });
}

/** Un règlement reçu hors ligne (virement, chèque). */
export async function marquerFacturePayee(factureId: string): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      const f = m.factures.find((x) => x.id === factureId);
      if (!f) throw new Error("Facture introuvable.");
      Object.assign(f, { statut: "payee", payee_le: aujourdhui(), paiement_ref: f.paiement_ref ?? "HORS-LIGNE" });
    });
    return { ok: true, message: "Facture marquée réglée." };
  });
}

// --- Pièces par destination --------------------------------------------------------------------

export async function enregistrerPiece(id: string | null, entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = pieceSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await modifierDonnees((m) => {
      const existante = id ? m.document_requirements.find((x) => x.id === id) : null;
      if (existante) Object.assign(existante, r.data);
      else m.document_requirements.push({ id: nouvelId("rq"), ...r.data });
    });
    return { ok: true, message: `« ${r.data.libelle} » enregistrée : les listes des dossiers concernés sont à jour.` };
  });
}

export async function supprimerPiece(id: string): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      m.document_requirements = m.document_requirements.filter((x) => x.id !== id);
    });
    return { ok: true, message: "Pièce retirée des listes." };
  });
}

// --- Cartons -----------------------------------------------------------------------------------

export async function enregistrerNbCartons(valeurs: Record<string, number | null>): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      for (const [id, n] of Object.entries(valeurs)) {
        const l = m.livraisons_cartons.find((x) => x.id === id);
        if (!l) continue;
        if (n !== null && (!Number.isInteger(n) || n < 0 || n > 500)) continue;
        l.nb_cartons = n || null;
        if (n && l.statut === "demandee") l.statut = "confirmee";
      }
    });
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
    return { ok: true, message: r.envoyes ? `${r.envoyes} client${r.envoyes > 1 ? "s" : ""} prévenu${r.envoyes > 1 ? "s" : ""} (SMS et e-mail).` : "Aucun message à envoyer : tous sont déjà partis, ou il manque un créneau ou un nombre de cartons." };
  });
}

export async function marquerCartonsLivres(samedi: string): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      for (const l of m.livraisons_cartons) if (l.date_samedi === samedi && l.nb_cartons) l.statut = "livree";
    });
    return { ok: true, message: "Livraisons du samedi marquées livrées." };
  });
}

// --- SAV ---------------------------------------------------------------------------------------

export async function changerStatutSav(id: string, statut: StatutSav): Promise<Resultat> {
  return garde(async () => {
    if (!["recue", "en_analyse", "cloturee"].includes(statut)) throw new Error("Statut inconnu.");
    await modifierDonnees((m) => {
      const s = m.sav_declarations.find((x) => x.id === id);
      if (!s) throw new Error("Déclaration introuvable.");
      s.statut = statut;
    });
    return { ok: true, message: "Déclaration mise à jour : le client voit le nouveau statut." };
  });
}

// --- Réglages : conseillers, tutos, services -----------------------------------------------------

export async function ajouterConseiller(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = conseillerSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await modifierDonnees((m) => {
      m.conseillers.push({ id: nouvelId("eq"), ...r.data });
    });
    return { ok: true, message: `${r.data.prenom} ${r.data.nom} ajouté(e).` };
  });
}

export async function supprimerConseiller(id: string): Promise<Resultat> {
  return garde(async () => {
    const r = await modifierDonnees((m) => {
      if (m.clients.some((c) => c.conseiller_id === id)) return false;
      m.conseillers = m.conseillers.filter((c) => c.id !== id);
      return true;
    });
    return r ? { ok: true, message: "Conseiller retiré." } : { ok: false, erreur: "Ce conseiller suit encore des clients : réattribuez-les d'abord." };
  });
}

export async function ajouterTuto(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = tutoSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await modifierDonnees((m) => {
      m.tutos.push({ id: nouvelId("tu"), ...r.data, duree_min: Math.max(1, r.data.etapes.length), image: "/espace-client/interieur-2.jpg", ordre: m.tutos.length + 1, actif: true });
    });
    return { ok: true, message: "Tuto publié dans tous les espaces." };
  });
}

export async function ajouterService(entree: Record<string, unknown>): Promise<Resultat> {
  return garde(async () => {
    const r = serviceSchema.safeParse(entree);
    if (!r.success) return echec(erreursDe(r.error));
    await modifierDonnees((m) => {
      m.services.push({ id: nouvelId("sv"), ...r.data, ordre: m.services.length + 1, actif: true });
    });
    return { ok: true, message: "Service ajouté à « Mes services complémentaires »." };
  });
}

export async function basculerContenu(type: "tutos" | "services", id: string): Promise<Resultat> {
  return garde(async () => {
    await modifierDonnees((m) => {
      const ligne = (type === "tutos" ? m.tutos : m.services).find((x) => x.id === id);
      if (ligne) ligne.actif = !ligne.actif;
    });
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
