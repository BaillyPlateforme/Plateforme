import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { estDemo } from "./config";
import { avecDelai } from "./depot";
import { pdfDevis, pdfFacture, pdfTemoin, reponsePdf } from "./pdf";
import { signer, verifier } from "./signature";
import type { Client, Donnees, Dossier, PieceJointe } from "./types";

/*
 * Les fichiers déposés : pièces du client, documents de l'équipe, photos des
 * conditions de livraison et des avaries.
 *
 * En base, ils rejoignent le seau privé « espace-client » de Supabase
 * Storage (créé par la migration 0011), sous fichiers/<dossier>/. Aucune
 * politique n'y ouvre la clé publique : seul le serveur dépose et lit. En
 * démonstration, ils restent en mémoire, dans la limite de 150 Mo : de quoi
 * voir le document que l'équipe vient de déposer s'ouvrir chez le client,
 * sans rien écrire nulle part.
 *
 * Un fichier ne sort que par deux portes : /espace-client/fichier (le client,
 * app externe) et /api/data/espace-client/fichier (l'équipe, app interne).
 * Chacune exige un lien signé de cinq minutes ET une session qui a droit au
 * dossier ; elle répond alors par une URL signée du seau, valable 60
 * secondes. Un lien recopié ailleurs ne sert donc à rien.
 */

export const SEAU = "espace-client";
/** Le temps d'ouvrir le fichier : au-delà, l'URL du seau ne vaut plus rien. */
const DUREE_URL_SEAU_S = 60;

type Coffre = typeof globalThis & { __ecFichiers?: Map<string, { donnees: Buffer; type: string; a: number }> };
const coffre = globalThis as Coffre;
const memoire = () => (coffre.__ecFichiers ??= new Map());
const PLAFOND_MEMOIRE = 150 * 1024 * 1024;

const nomPropre = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "fichier";

export function cheminFichier(dossierId: string, nom: string, rubrique = "") {
  return `fichiers/${dossierId}/${rubrique ? `${rubrique}/` : ""}${randomUUID().slice(0, 8)}-${nomPropre(nom)}`;
}

export async function deposerFichier(chemin: string, donnees: Buffer, type: string) {
  if (estDemo()) {
    const m = memoire();
    m.set(chemin, { donnees, type, a: Date.now() });
    // Au-delà du plafond, les plus anciens partent : c'est une démonstration.
    let total = [...m.values()].reduce((s, f) => s + f.donnees.length, 0);
    for (const [k, f] of [...m.entries()].sort((a, b) => a[1].a - b[1].a)) {
      if (total <= PLAFOND_MEMOIRE) break;
      m.delete(k);
      total -= f.donnees.length;
    }
    return;
  }
  const { error } = await avecDelai(createServiceClient().storage.from(SEAU).upload(chemin, donnees, { contentType: type, upsert: false }), 30_000, "Le stockage ne répond pas.");
  if (error) throw new Error(`Dépôt du fichier impossible : ${error.message}`);
}

export async function retirerFichier(chemin: string) {
  if (estDemo()) {
    memoire().delete(chemin);
    return;
  }
  await avecDelai(createServiceClient().storage.from(SEAU).remove([chemin])).catch(() => undefined);
}

/** Lit un `File` reçu par une action, prêt à déposer. */
export async function octets(f: File) {
  return Buffer.from(await f.arrayBuffer());
}

// --- Les liens ------------------------------------------------------------------------------------------

/** Ce qu'un lien de fichier peut désigner ; « msg » : la pièce jointe d'un message de la discussion (discussion.ts). */
export type TypeFichier = "doc" | "devis" | "facture" | "photo" | "msg";
const DUREE_S = 5 * 60;

/** La porte du client (app externe). Celle de l'équipe est sous /api/data/espace-client. */
export const PORTE_FICHIERS_CLIENT = "/espace-client/fichier";

/** Un lien de cinq minutes. Il ne suffit pas : la porte vérifie aussi la session. */
export function lienFichier(type: TypeFichier, id: string, { porte = PORTE_FICHIERS_CLIENT, telecharger = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S;
  const sig = signer(`${type}:${id}:${exp}`, "fichier");
  return `${porte}/${type}/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}${telecharger ? "&dl=1" : ""}`;
}

/**
 * Le lien de l'archive d'un dossier (toutes ses pièces en un ZIP) : cinq
 * minutes aussi, et seulement sur la porte de l'équipe (archive.ts).
 */
export function lienArchive(dossierId: string, porte: string) {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S;
  return `${porte}/${encodeURIComponent(dossierId)}?exp=${exp}&sig=${signer(`archive:${dossierId}:${exp}`, "fichier")}`;
}

/** Les octets d'un fichier déposé : du seau, ou de la mémoire en démonstration. Null s'il n'y est pas (ou plus). */
export async function lireOctets(chemin: string): Promise<{ donnees: Buffer; type: string } | null> {
  if (estDemo()) {
    const f = memoire().get(chemin);
    return f ? { donnees: f.donnees, type: f.type } : null;
  }
  const { data, error } = await avecDelai(createServiceClient().storage.from(SEAU).download(chemin), 30_000, "Le stockage ne répond pas.").catch(() => ({
    data: null,
    error: new Error("Le stockage ne répond pas."),
  }));
  if (error || !data) return null;
  return { donnees: Buffer.from(await data.arrayBuffer()), type: data.type };
}

export function lienValide(type: string, id: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return verifier(`${type}:${id}:${exp}`, sig, "fichier");
}

const refus = (texte: string, status: number) =>
  new Response(texte, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Sert un fichier, une fois le lien vérifié et le droit établi.
 *
 * `d` : les données où chercher la pièce — pour le client, celles que lui
 * rend la RLS : la pièce d'un autre client n'y figure tout simplement pas.
 * `autorise` : le dernier mot sur le dossier trouvé (titulaire, masquages).
 */
export async function servirFichier(
  d: Donnees,
  type: string,
  id: string,
  url: URL,
  autorise: (dossier: Dossier, client: Client) => boolean,
): Promise<Response> {
  if (!lienValide(type, id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return refus("Lien expiré ou invalide : rechargez la page pour en obtenir un nouveau.", 403);
  }
  const telecharger = url.searchParams.get("dl") === "1";

  // Le dossier de la pièce demandée.
  let dossierId: string | undefined;
  let photo: PieceJointe | undefined;
  if (type === "doc") dossierId = d.documents.find((x) => x.id === id)?.dossier_id;
  else if (type === "devis") dossierId = d.devis.find((x) => x.id === id)?.dossier_id;
  else if (type === "facture") dossierId = d.factures.find((x) => x.id === id)?.dossier_id;
  else if (type === "photo") {
    for (const c of d.conditions_livraison) {
      const p = c.photos.find((x) => x.id === id);
      if (p) [photo, dossierId] = [p, c.dossier_id];
    }
    for (const s of d.sav_declarations) {
      const p = s.photos.find((x) => x.id === id);
      if (p) [photo, dossierId] = [p, s.dossier_id];
    }
  }
  const dossier = d.dossiers.find((x) => x.id === dossierId);
  const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
  // Même réponse qu'il n'existe pas ou qu'il ne soit pas à vous : rien ne se devine.
  if (!dossier || !client || !autorise(dossier, client)) return refus("Introuvable.", 404);

  if (type === "devis") {
    const devis = d.devis.find((x) => x.id === id)!;
    return reponsePdf(await pdfDevis(client, dossier, devis), `devis-${devis.numero}.pdf`, telecharger);
  }
  if (type === "facture") {
    const f = d.factures.find((x) => x.id === id)!;
    return reponsePdf(await pdfFacture(client, dossier, f), `facture-${f.numero}.pdf`, telecharger);
  }

  const doc = type === "doc" ? d.documents.find((x) => x.id === id)! : null;
  const chemin = doc ? doc.chemin : photo!.chemin;
  const nom = doc ? doc.nom_fichier : photo!.nom;
  // Les documents du jeu de démonstration n'ont pas de fichier : une page témoin en tient lieu.
  const temoin = async () =>
    doc ? reponsePdf(await pdfTemoin(dossier, doc), nom.replace(/\.\w+$/, "") + ".pdf", telecharger) : refus("Ce fichier n'est plus disponible.", 404);

  return (await reponseDuSeau(chemin, nom, telecharger)) ?? temoin();
}

/**
 * Un fichier déposé, une fois le droit établi par l'appelant : en base, une
 * redirection vers une URL signée du seau, valable 60 secondes ; en
 * démonstration, le fichier gardé en mémoire. Null s'il n'existe plus.
 */
export async function reponseDuSeau(chemin: string, nom: string, telecharger: boolean): Promise<Response | null> {
  if (!estDemo()) {
    const { data, error } = await avecDelai(
      createServiceClient().storage.from(SEAU).createSignedUrl(chemin, DUREE_URL_SEAU_S, telecharger ? { download: nom } : undefined),
    ).catch(() => ({ data: null, error: new Error("Le stockage ne répond pas.") }));
    if (error || !data?.signedUrl) return null;
    return new Response(null, {
      status: 302,
      headers: { Location: data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  const fichier = memoire().get(chemin);
  if (!fichier) return null;
  const affichable = /^(application\/pdf|image\/(jpeg|png|webp))$/.test(fichier.type);
  return new Response(new Uint8Array(fichier.donnees), {
    headers: {
      "Content-Type": fichier.type,
      "Content-Disposition": `${affichable && !telecharger ? "inline" : "attachment"}; filename="${nom.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
