import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { modeDonnees } from "./config";
import { avecDelai, creerSeau, SEAU } from "./depot";
import { signer, verifier } from "./signature";

/*
 * Les fichiers déposés : pièces du client, documents de l'équipe, photos des
 * conditions de livraison et des avaries.
 *
 * En stockage, ils rejoignent le seau privé « espace-client », sous
 * fichiers/<dossier>/. En démonstration, ils restent en mémoire, dans la
 * limite de 150 Mo : de quoi voir le document que l'équipe vient de déposer
 * s'ouvrir chez le client, sans rien écrire nulle part.
 *
 * Aucun fichier n'est jamais servi par une adresse publique : on passe par
 * /espace-client/fichier, avec un lien signé de cinq minutes, ET une session
 * qui a droit au dossier.
 */

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
  if (modeDonnees() === "demo") {
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
  const stockage = createServiceClient().storage;
  const envoyer = () => avecDelai(stockage.from(SEAU).upload(chemin, donnees, { contentType: type, upsert: false }));
  let { error } = await envoyer();
  if (error && /not found|does not exist/i.test(error.message)) {
    await creerSeau();
    ({ error } = await envoyer());
  }
  if (error) throw new Error(`Dépôt du fichier impossible : ${error.message}`);
}

export async function lireFichier(chemin: string): Promise<{ donnees: Buffer; type: string } | null> {
  if (modeDonnees() === "demo") return memoire().get(chemin) ?? null;
  const { data, error } = await avecDelai(createServiceClient().storage.from(SEAU).download(chemin));
  if (error || !data) return null;
  return { donnees: Buffer.from(await data.arrayBuffer()), type: data.type || "application/octet-stream" };
}

export async function retirerFichier(chemin: string) {
  if (modeDonnees() === "demo") {
    memoire().delete(chemin);
    return;
  }
  await avecDelai(createServiceClient().storage.from(SEAU).remove([chemin])).catch(() => undefined);
}

/** Ce qu'un lien de fichier peut désigner. */
export type TypeFichier = "doc" | "devis" | "facture" | "photo";
const DUREE_S = 5 * 60;

/** Un lien de cinq minutes. Il ne suffit pas : la route vérifie aussi la session. */
export function lienFichier(type: TypeFichier, id: string, telecharger = false) {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S;
  const sig = signer(`${type}:${id}:${exp}`, "fichier");
  return `/espace-client/fichier/${type}/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}${telecharger ? "&dl=1" : ""}`;
}

export function lienValide(type: string, id: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return verifier(`${type}:${id}:${exp}`, sig, "fichier");
}

/** Lit un `File` reçu par une action, prêt à déposer. */
export async function octets(f: File) {
  return Buffer.from(await f.arrayBuffer());
}
