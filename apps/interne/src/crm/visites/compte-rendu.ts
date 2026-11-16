import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { SEAU as SEAU_ESPACE } from "@/lib/espace-client/fichiers";
import { pdfCompteRendu, type PhotosParPiece } from "@/lib/visite/pdf";
import { volumesParDestination } from "@/lib/visite/destinations";
import { FORMULES, GENRE_ETAPE, jsonCanonique, volumeObjets, type ContenuCompteRendu } from "@/lib/visite/regles";
import { q, q1 } from "@/crm/lib/db";
import { SEAU as SEAU_PHOTOS } from "@/terrain/lib/photos";
import type { Saisie } from "./donnees";

/*
 * Le compte-rendu de la visite.
 *
 * `contenuDe` fige la saisie en un contenu (pièces, métré, accès, options,
 * remarques) : c'est ce que le client relit sur la tablette, ce que
 * l'empreinte SHA-256 scelle, ce que le PDF met en page. Il ne dépend que de
 * la saisie — pas de l'heure à laquelle on le calcule — : relu une seconde
 * fois, le même contenu donne la même empreinte, et la signature vérifie que
 * le client a signé exactement ce qu'il a vu.
 *
 * Quand le dossier a plusieurs destinations (garde-meuble, deux livraisons…),
 * chaque objet porte la sienne et le compte-rendu donne le volume par
 * destination ; avec une seule, le contenu reste celui d'avant.
 *
 * Le PDF est produit une fois, après la signature, et rangé dans le seau
 * privé de l'espace client (sous crm/<dossier>/visites/) : la projection le
 * range parmi les documents du client, et le CRM le sert par une URL signée
 * d'une minute.
 */

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function contenuDe(s: Saisie): ContenuCompteRendu {
  const destinations = s.destinations ?? [];
  const reparti = destinations.length > 1;
  const libelleDe = new Map(destinations.map((d) => [d.id, d.libelle]));
  const pieces = s.pieces
    .map((p) => {
      const objets = s.objets
        .filter((o) => o.piece === p.cle)
        .map((o) => ({
          libelle: o.libelle, quantite: o.quantite, volume_unitaire: arrondi(o.volume), volume: arrondi(o.quantite * o.volume),
          demontage: o.demontage, fragile: o.fragile, note: o.note,
          ...(reparti ? { destination: (o.destination != null ? libelleDe.get(o.destination) : null) ?? o.destinationLibre ?? "Sans destination" } : {}),
        }));
      return {
        cle: p.cle, nom: p.nom, remarque: p.remarque?.trim() || null, volume: volumeObjets(objets.map((o) => ({ quantite: o.quantite, volume: o.volume_unitaire }))),
        objets, photos: s.photos.filter((ph) => ph.piece === p.cle).length,
      };
    })
    // Une pièce créée puis laissée vide ne figure pas au compte-rendu.
    .filter((p) => p.objets.length > 0 || p.remarque || p.photos > 0);
  const formule = FORMULES.find((f) => f.cle === s.visite.formule);
  return {
    version: 1,
    dossier: { ref: s.dossier.ref, client: s.dossier.client, contact: s.dossier.contact, telephone: s.dossier.telephone?.trim() || null, email: s.dossier.email?.trim() || null },
    visite: { id: s.visite.id, le: s.rdv?.debut ?? s.visite.commenceeLe, commercial: s.visite.commercial ?? "", mode: s.rdv?.type === "visio" ? "visio" : "sur_place" },
    trajet: s.etapes
      .filter((e) => e.adresse?.trim())
      .map((e) => ({
        genre: e.genre, libelle: GENRE_ETAPE[e.genre] ?? "Étape", adresse: e.adresse!.trim(), etage: e.etage, ascenseur: e.ascenseur, escalier: e.escalier,
        portage_m: e.portage_m, stationnement: e.stationnement, poids_lourd: e.poids_lourd, monte_meuble: e.monte_meuble,
        monte_charge: !!e.monte_charge, transbordement: !!e.transbordement, acces: e.acces?.trim() || null,
        // Les champs du 16/11/2026 ne figurent que renseignés : un compte-rendu sans eux reste celui d'avant.
        ...(e.ascenseur && e.ascenseur_taille?.trim() ? { ascenseur_taille: e.ascenseur_taille.trim() } : {}),
        ...(e.escalier_precision?.trim() ? { escalier_precision: e.escalier_precision.trim() } : {}),
        ...(e.stationnement_precision?.trim() ? { stationnement_precision: e.stationnement_precision.trim() } : {}),
      })),
    pieces,
    ...(reparti
      ? { destinations: volumesParDestination(s.objets, destinations).map((d) => ({ libelle: d.libelle, volume: d.volume, objets: d.objets })) }
      : {}),
    volume: volumeObjets(s.objets),
    nb_objets: s.objets.reduce((n, o) => n + o.quantite, 0),
    nb_photos: pieces.reduce((n, p) => n + p.photos, 0),
    options: s.visite.options.filter((o) => o.proposee).map((o) => o.libelle),
    formule: formule ? { cle: formule.cle, nom: formule.nom, sous: formule.sous } : null,
    remarques: s.visite.remarques?.trim() || null,
  };
}

/** L'empreinte SHA-256 du contenu, sur son texte canonique. */
export const empreinteDe = (c: ContenuCompteRendu) => createHash("sha256").update(jsonCanonique(c), "utf8").digest("hex");

/** Les vignettes des photos d'une visite, par pièce : quatre au plus par pièce, vingt-quatre en tout. */
async function vignettes(visiteId: number): Promise<PhotosParPiece> {
  const photos = await q<{ piece: string | null; chemin: string; vignette: string | null }>(
    "select piece_cle::text as piece, chemin, chemin_vignette as vignette from visite_photos where visite_id = $1 order by prise_le, id",
    [visiteId],
  );
  const parPiece = new Map<string, typeof photos>();
  for (const p of photos) if (p.piece) parPiece.set(p.piece, [...(parPiece.get(p.piece) ?? []), p].slice(0, 4));
  const choisies = [...parPiece.entries()].flatMap(([piece, l]) => l.map((p) => ({ piece, chemin: p.vignette ?? p.chemin }))).slice(0, 24);
  const stockage = createServiceClient().storage.from(SEAU_PHOTOS);
  const lues = await Promise.all(
    choisies.map(async (p) => {
      const { data, error } = await stockage.download(p.chemin);
      if (error || !data) throw new Error(`photo ${p.chemin} illisible : ${error?.message ?? "réponse vide"}`);
      const octets = Buffer.from(await data.arrayBuffer());
      // Le PDF n'embarque que du JPEG (reconnu à ses premiers octets) : une vignette faite par le navigateur l'est toujours.
      return octets[0] === 0xff && octets[1] === 0xd8 ? { piece: p.piece, octets } : null;
    }),
  );
  const out: PhotosParPiece = new Map();
  for (const l of lues) if (l) out.set(l.piece, [...(out.get(l.piece) ?? []), l.octets]);
  return out;
}

/** Les vignettes, ou aucune : une photo illisible ne doit pas empêcher le compte-rendu. */
const vignettesOuRien = (visiteId: number) =>
  vignettes(visiteId).catch((e) => {
    console.error(`BaillyCRM : photos du compte-rendu de la visite ${visiteId} non jointes`, e instanceof Error ? e.message : e);
    return new Map() as PhotosParPiece;
  });

/**
 * Produit le PDF d'un compte-rendu signé et le range, une seule fois. Rend
 * son chemin dans le seau, ou null si la visite n'est pas signée.
 */
export async function genererDocument(visiteId: number): Promise<string | null> {
  const v = await q1<{ dossier_id: number; statut: string; contenu: ContenuCompteRendu; empreinte: string; signataire: string; signature: string; signe_le: Date; document_chemin: string | null }>(
    "select dossier_id, statut, contenu, empreinte, signataire, signature, signe_le, document_chemin from visites where id = $1",
    [visiteId],
  );
  if (!v || v.statut !== "signee") return null;
  if (v.document_chemin) return v.document_chemin;
  const pdf = await pdfCompteRendu(
    v.contenu,
    { signataire: v.signataire, signeLe: new Date(v.signe_le).toISOString(), empreinte: v.empreinte, image: Buffer.from(v.signature.replace(/^data:image\/png;base64,/, ""), "base64") },
    await vignettesOuRien(visiteId),
  );
  const chemin = `crm/${v.dossier_id}/visites/${visiteId}-${v.empreinte.slice(0, 12)}.pdf`;
  const { error } = await createServiceClient().storage.from(SEAU_ESPACE).upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Dépôt du compte-rendu impossible : ${error.message}`);
  await q("update visites set document_chemin = $2, document_taille = $3 where id = $1 and document_chemin is null", [visiteId, chemin, pdf.length]);
  return chemin;
}

/** Le PDF d'un compte-rendu signé, produit à la volée depuis son contenu figé (quand le dépôt a échoué). */
export async function pdfALaVolee(visiteId: number): Promise<Buffer | null> {
  const v = await q1<{ statut: string; contenu: ContenuCompteRendu; empreinte: string; signataire: string; signature: string; signe_le: Date }>(
    "select statut, contenu, empreinte, signataire, signature, signe_le from visites where id = $1",
    [visiteId],
  );
  if (!v || v.statut !== "signee") return null;
  return pdfCompteRendu(
    v.contenu,
    { signataire: v.signataire, signeLe: new Date(v.signe_le).toISOString(), empreinte: v.empreinte, image: Buffer.from(v.signature.replace(/^data:image\/png;base64,/, ""), "base64") },
    await vignettesOuRien(visiteId),
  );
}

/** Une URL signée d'une minute vers le PDF rangé. */
export async function urlDocument(chemin: string, telecharger?: string) {
  const { data, error } = await createServiceClient()
    .storage.from(SEAU_ESPACE)
    .createSignedUrl(chemin, 60, telecharger ? { download: telecharger } : undefined);
  if (error || !data) throw new Error(`Lien du compte-rendu impossible : ${error?.message ?? "réponse vide"}`);
  return data.signedUrl;
}
