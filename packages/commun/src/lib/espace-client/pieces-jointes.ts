import "server-only";
import { CATEGORIES_DOCUMENT_EQUIPE, TYPE_FACTURE } from "./libelles";
import { nomClient } from "./format";
import type { DossierSnapshot } from "./progression";
import type { Conseiller } from "./types";
import type { TypeFichier } from "./fichiers";

/*
 * Toutes les pièces jointes d'un dossier, en une liste : ce que le client a
 * déposé, ce que l'équipe a déposé, les devis et les factures (des PDF
 * produits à la demande), les photos des conditions de livraison et des
 * déclarations d'avarie. La fiche de l'équipe les montre, l'archive ZIP les
 * emporte : une seule liste pour les deux, tirée du seul dossier demandé.
 */

/** Le filtre de l'écran : qui a fourni la pièce, ou ce qu'elle est. */
export type GroupeFichier = "client" | "equipe" | "devis" | "photos";

export const GROUPES_FICHIERS: { cle: GroupeFichier; libelle: string; dossier: string }[] = [
  { cle: "client", libelle: "Pièces du client", dossier: "1 - Pièces du client" },
  { cle: "equipe", libelle: "Documents de l'équipe", dossier: "2 - Documents de l'équipe" },
  { cle: "devis", libelle: "Devis et factures", dossier: "3 - Devis et factures" },
  { cle: "photos", libelle: "Photos", dossier: "4 - Photos" },
];

export interface FichierDossier {
  /** « doc:… », « devis:… » : unique dans le dossier. */
  cle: string;
  type: TypeFichier;
  id: string;
  /** Ce que c'est : « Pièce d'identité », « Devis DV-2026-0147-1 ». */
  libelle: string;
  /** Le nom du fichier. */
  nom: string;
  groupe: GroupeFichier;
  /** La catégorie, en clair. */
  categorie: string;
  /** Qui l'a fourni : le client, un membre de l'équipe, ou le CRM pour un PDF produit. */
  par: string;
  source: "client" | "equipe" | "crm";
  le: string;
  /** En octets ; null pour un PDF produit à la demande. */
  taille: number | null;
  mime: string;
  /** Le document de l'espace, pour le retirer (documents de l'équipe seulement). */
  documentId: string | null;
  /** La pièce demandée à laquelle il répond. */
  requirementId: string | null;
  /** Le chemin dans le seau (documents et photos) ; null pour un PDF produit. */
  chemin: string | null;
}

const CATEGORIES: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES_DOCUMENT_EQUIPE),
  identite: "Pièce demandée",
  pays: "Pièce du pays",
  segment: "Pièce du segment",
  visite: "Compte-rendu de visite",
  autre: "Autre",
};

const pdf = "application/pdf";

export function fichiersDuDossier(s: DossierSnapshot, conseillers: Conseiller[]): FichierDossier[] {
  const client = nomClient(s.client);
  const auteur = (source: string, par: string) => {
    if (source === "client") return client;
    const c = conseillers.find((k) => k.id === par);
    if (c) return `${c.prenom} ${c.nom}`.trim();
    return par.includes("@") ? par : "Équipe Bailly";
  };
  const out: FichierDossier[] = [];

  for (const x of s.documents) {
    const piece = x.requirement_id ? s.requirements.find((r) => r.id === x.requirement_id) : null;
    out.push({
      cle: `doc:${x.id}`, type: "doc", id: x.id, libelle: x.libelle, nom: x.nom_fichier,
      groupe: x.source === "client" ? "client" : "equipe",
      categorie: piece ? (piece.pays ? "Pièce du pays" : piece.segment ? "Pièce du segment" : "Pièce demandée") : x.crm_visite_id ? "Compte-rendu de visite" : (CATEGORIES[x.categorie] ?? x.categorie),
      par: auteur(x.source, x.created_by), source: x.source, le: x.created_at, taille: x.taille_octets || null, mime: x.mime || pdf,
      documentId: x.id, requirementId: x.requirement_id, chemin: x.chemin,
    });
  }
  // Les devis et factures : ceux que voit le client, et ceux qu'un grand compte ne voit pas (l'équipe les tient).
  for (const v of s.devis) {
    out.push({
      cle: `devis:${v.id}`, type: "devis", id: v.id, libelle: `Devis ${v.numero}`, nom: `devis-${v.numero}.pdf`, groupe: "devis", categorie: "Devis",
      par: v.crm_devis_id != null ? "CRM" : "Équipe Bailly", source: "crm", le: v.emis_le, taille: null, mime: pdf, documentId: null, requirementId: null, chemin: null,
    });
  }
  for (const f of s.factures) {
    out.push({
      cle: `facture:${f.id}`, type: "facture", id: f.id, libelle: `${f.crm_paiement_id != null ? "Reçu" : "Facture"} ${f.numero}`, nom: `facture-${f.numero}.pdf`, groupe: "devis",
      categorie: f.crm_paiement_id != null ? "Règlement" : `Facture · ${TYPE_FACTURE[f.type]}`,
      par: f.crm_facture_id != null || f.crm_paiement_id != null ? "CRM" : "Équipe Bailly", source: "crm", le: f.emise_le, taille: null, mime: pdf, documentId: null, requirementId: null, chemin: null,
    });
  }
  // Les photos : conditions de livraison, puis chaque déclaration d'avarie.
  for (const p of s.conditions?.photos ?? []) {
    out.push({
      cle: `photo:${p.id}`, type: "photo", id: p.id, libelle: "Photo de l'accès", nom: p.nom, groupe: "photos", categorie: "Conditions de livraison",
      par: client, source: "client", le: s.conditions!.valide_at ?? s.dossier.created_at, taille: p.taille || null, mime: p.mime, documentId: null, requirementId: null, chemin: p.chemin,
    });
  }
  for (const sav of s.sav) {
    for (const p of sav.photos) {
      out.push({
        cle: `photo:${p.id}`, type: "photo", id: p.id, libelle: `Avarie ${sav.numero}`, nom: p.nom, groupe: "photos", categorie: `SAV · ${sav.numero}`,
        par: client, source: "client", le: sav.created_at, taille: p.taille || null, mime: p.mime, documentId: null, requirementId: null, chemin: p.chemin,
      });
    }
  }
  return out.sort((a, b) => b.le.localeCompare(a.le));
}
