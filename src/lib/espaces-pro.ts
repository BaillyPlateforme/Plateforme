import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/server";
import {
  AJUSTEMENT_MAX,
  AJUSTEMENT_MIN,
  ESPACES_PAR_DEFAUT,
  LOGO_FOURNI,
  REGLES_PAR_DEFAUT,
  couleurValide,
  espaceEffectif,
  normaliser,
  normaliserRegles,
  slugifier,
  type EspacePro,
  type Regles,
} from "@/lib/espaces";

/*
 * Où vivent les espaces pro.
 *
 * Dans le stockage de fichiers de Supabase : un seau « espaces-pro », un
 * fichier `espaces.json` pour la configuration, un dossier `logos/` pour les
 * images. Pas dans une table : en ajouter une demanderait une migration, et
 * la fonctionnalité resterait éteinte tant qu'elle n'est pas passée. Le seau,
 * lui, se crée tout seul au premier enregistrement.
 *
 * Tant que rien n'a été enregistré, la liste est celle du code : les grands
 * comptes et l'espace standard existent dès le déploiement.
 */
const SEAU = "espaces-pro";
const FICHIER = "espaces.json";

// La configuration est lue à chaque page d'un espace : on la garde quelques
// secondes en mémoire plutôt que de retélécharger le fichier à chaque fois.
//
// Elle est rangée sur `globalThis`, pas dans une variable du module : Next
// charge ce fichier une fois pour les pages et les actions, une autre pour les
// routes d'API. Avec une variable par copie, la route du logo ignorait pendant
// vingt secondes l'espace que l'action venait d'enregistrer — et répondait 404.
/*
 * Le code d'un lien.
 *
 * Il se calcule à partir d'une clé du serveur et de l'identifiant de l'espace :
 * rien à enregistrer, rien à écrire dans le code — le dépôt est public, un
 * code écrit ici se lirait sur GitHub. Sans voyelles ni caractères ambigus :
 * il ne forme pas de mot et se dicte au téléphone.
 */
const LETTRES = "bcdfghjkmnpqrstvwxz23456789";
export function codeEspace(e: Pick<EspacePro, "id" | "rotation">): string {
  const cle = process.env.ESPACES_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error("Aucune clé serveur : les liens des espaces pro ne peuvent pas être calculés.");
  const empreinte = createHmac("sha256", cle).update(`espace-pro:${e.id}:${e.rotation}`).digest();
  let code = "";
  for (let i = 0; i < 10; i++) code += LETTRES[empreinte[i] % LETTRES.length];
  return code;
}
const avecCode = (e: EspacePro): EspacePro => ({ ...e, code: codeEspace(e) });
/** Le code ne s'enregistre pas : il se recalcule à chaque lecture. */
const sansCode = (e: EspacePro) => {
  const copie: Partial<EspacePro> = { ...e };
  delete copie.code;
  return copie;
};

/** Les logos livrés avec le site : hors du dossier public, ils ne se servent que par le code du lien. */
const DOSSIER_LOGOS = path.join(process.cwd(), "assets", "espaces");
const fourni = (logo: string | null | undefined) => !!logo && logo.startsWith(LOGO_FOURNI);

/** Tout ce que le fichier contient : les espaces, et les règles générales des grands comptes. */
type Tout = { espaces: EspacePro[]; regles: Regles };
type Memoire = ({ a: number } & Tout) | null;
const coffre = globalThis as typeof globalThis & { __espacesPro?: Memoire };
const lire = (): Memoire => coffre.__espacesPro ?? null;
const retenir = (tout: Tout) => {
  coffre.__espacesPro = { a: Date.now(), ...tout };
};
const DUREE = 20_000;

const introuvable = (message: string) => /not found|does not exist|no such/i.test(message);

async function creerSeau() {
  const { error } = await createServiceClient().storage.createBucket(SEAU, { public: false });
  if (error && !/exist/i.test(error.message)) throw new Error(`Création du stockage impossible : ${error.message}`);
}

async function lireTout(): Promise<Tout> {
  const cache = lire();
  if (cache && Date.now() - cache.a < DUREE) return { espaces: cache.espaces, regles: cache.regles };

  const { data, error } = await createServiceClient().storage.from(SEAU).download(FICHIER);
  let tout: Tout;
  if (error || !data) {
    // Rien d'enregistré encore : la liste de départ. Toute autre erreur
    // (réseau, droits) se voit, plutôt que de masquer une configuration réelle.
    if (error && !introuvable(error.message)) throw new Error(`Lecture des espaces impossible : ${error.message}`);
    tout = { espaces: ESPACES_PAR_DEFAUT.map(avecCode), regles: REGLES_PAR_DEFAUT };
  } else {
    try {
      const brut = JSON.parse(await data.text()) as { espaces?: Partial<EspacePro>[]; regles?: Partial<Regles> };
      tout = { espaces: (brut.espaces ?? []).map((e) => avecCode(normaliser(e))), regles: normaliserRegles(brut.regles) };
    } catch {
      throw new Error("La configuration des espaces est illisible.");
    }
  }

  retenir(tout);
  return tout;
}

/**
 * Les espaces tels que l'équipe les a réglés — sans les règles générales
 * appliquées : c'est la liste que l'espace équipe édite.
 */
export async function listEspaces(): Promise<EspacePro[]> {
  return (await lireTout()).espaces;
}

/** Les règles générales des grands comptes. */
export async function lireRegles(): Promise<Regles> {
  return (await lireTout()).regles;
}

/**
 * L'espace d'un lien, tel qu'il s'applique : pour un grand compte, les règles
 * générales sont résolues. Actif ou non — c'est à l'appelant d'en décider.
 */
export async function getEspace(slug: string): Promise<EspacePro | null> {
  const cle = slugifier(slug);
  const { espaces, regles } = await lireTout();
  const espace = espaces.find((e) => e.slug === cle);
  return espace ? espaceEffectif(espace, regles) : null;
}

/** L'espace d'un lien, retrouvé par son code — tel qu'il s'applique, règles générales résolues. */
export async function getEspaceParCode(code: string): Promise<EspacePro | null> {
  if (!code) return null;
  const { espaces, regles } = await lireTout();
  const espace = espaces.find((e) => e.code === code);
  return espace ? espaceEffectif(espace, regles) : null;
}

async function ecrire(espaces: EspacePro[], regles?: Regles) {
  const tout: Tout = { espaces, regles: regles ?? (await lireTout()).regles };
  const corps = JSON.stringify({ regles: tout.regles, espaces: tout.espaces.map(sansCode) }, null, 2);
  const stockage = createServiceClient().storage;
  const envoyer = () =>
    stockage.from(SEAU).upload(FICHIER, corps, { upsert: true, contentType: "application/json", cacheControl: "0" });

  let { error } = await envoyer();
  if (error && introuvable(error.message)) {
    await creerSeau();
    ({ error } = await envoyer());
  }
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  retenir(tout);
}

/** Enregistre les règles générales des grands comptes. */
export async function enregistrerRegles(entree: Partial<Regles>): Promise<Regles> {
  const ajustement = Number(entree.ajustement_volume ?? 0);
  if (!Number.isFinite(ajustement) || ajustement < AJUSTEMENT_MIN || ajustement > AJUSTEMENT_MAX)
    throw new Error(`La cote sur le volume doit rester entre ${AJUSTEMENT_MIN} % et +${AJUSTEMENT_MAX} %.`);
  const { espaces, regles: avant } = await lireTout();
  const regles = normaliserRegles({ ...avant, ...entree });
  await ecrire(espaces, regles);
  return regles;
}

/** Crée ou met à jour un espace. Renvoie l'espace tel qu'il est enregistré. */
export async function enregistrerEspace(entree: Partial<EspacePro>): Promise<EspacePro> {
  const liste = [...(await listEspaces())];
  const existant = entree.id ? liste.find((e) => e.id === entree.id) : undefined;

  const nom = (entree.nom ?? existant?.nom ?? "").trim();
  if (!nom) throw new Error("Donnez un nom à l'espace.");
  const slug = slugifier(entree.slug || nom);
  if (!slug) throw new Error("Le lien ne peut pas être vide.");
  if (liste.some((e) => e.slug === slug && e.id !== existant?.id))
    throw new Error(`Le lien « ${slug} » est déjà pris par un autre espace.`);
  if (entree.couleur != null && !couleurValide(entree.couleur))
    throw new Error("La couleur doit être un code hexadécimal, par exemple #0055a4.");
  const ajustement = Number(entree.ajustement_volume ?? existant?.ajustement_volume ?? 0);
  if (!Number.isFinite(ajustement) || ajustement < AJUSTEMENT_MIN || ajustement > AJUSTEMENT_MAX)
    throw new Error(`La cote sur le volume doit rester entre ${AJUSTEMENT_MIN} % et +${AJUSTEMENT_MAX} %.`);

  const maintenant = new Date().toISOString();
  const espace = avecCode(normaliser({
    ...existant,
    ...entree,
    id: existant?.id ?? randomUUID(),
    nom,
    slug,
    // Le lien ne change que par « nouveau lien », jamais par un enregistrement.
    rotation: existant?.rotation ?? 0,
    // Le logo ne se change que par son propre chemin de téléversement.
    logo: existant?.logo ?? null,
    created_at: existant?.created_at ?? maintenant,
    updated_at: maintenant,
  }));

  await ecrire(existant ? liste.map((e) => (e.id === espace.id ? espace : e)) : [...liste, espace]);
  return espace;
}

/**
 * Donne un nouveau lien à un espace : l'ancien cesse aussitôt de fonctionner.
 * Pour un lien qui a circulé plus loin que prévu.
 */
export async function renouvelerLien(id: string): Promise<EspacePro> {
  const liste = await listEspaces();
  const espace = liste.find((e) => e.id === id);
  if (!espace) throw new Error("Espace introuvable.");
  const maj = avecCode({ ...espace, rotation: espace.rotation + 1, updated_at: new Date().toISOString() });
  await ecrire(liste.map((e) => (e.id === id ? maj : e)));
  return maj;
}

export async function supprimerEspace(id: string) {
  const liste = await listEspaces();
  const espace = liste.find((e) => e.id === id);
  if (!espace) return;
  if (espace.logo && !fourni(espace.logo)) await createServiceClient().storage.from(SEAU).remove([espace.logo]);
  await ecrire(liste.filter((e) => e.id !== id));
}

const TYPES_LOGO: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
/** Assez pour un logo net, pas assez pour alourdir un e-mail. */
export const POIDS_LOGO_MAX = 600 * 1024;

/**
 * Enregistre le logo d'un espace. PNG ou JPEG seulement : ce sont les deux
 * formats que lisent à la fois les navigateurs, les boîtes mail et le PDF.
 */
export async function enregistrerLogo(id: string, fichier: { type: string; donnees: Buffer }): Promise<EspacePro> {
  const extension = TYPES_LOGO[fichier.type];
  if (!extension) throw new Error("Le logo doit être un fichier PNG ou JPEG.");
  if (fichier.donnees.length > POIDS_LOGO_MAX) throw new Error("Le logo dépasse 600 Ko : choisissez un fichier plus léger.");

  const liste = await listEspaces();
  const espace = liste.find((e) => e.id === id);
  if (!espace) throw new Error("Enregistrez d'abord l'espace, puis ajoutez son logo.");

  const stockage = createServiceClient().storage;
  const chemin = `logos/${espace.id}-${Date.now()}.${extension}`;
  const envoyer = () => stockage.from(SEAU).upload(chemin, fichier.donnees, { contentType: fichier.type, upsert: true });
  let { error } = await envoyer();
  if (error && introuvable(error.message)) {
    await creerSeau();
    ({ error } = await envoyer());
  }
  if (error) throw new Error(`Téléversement impossible : ${error.message}`);

  if (espace.logo && !fourni(espace.logo)) await stockage.from(SEAU).remove([espace.logo]);
  const maj = { ...espace, logo: chemin, updated_at: new Date().toISOString() };
  await ecrire(liste.map((e) => (e.id === id ? maj : e)));
  return maj;
}

export async function retirerLogo(id: string): Promise<EspacePro | null> {
  const liste = await listEspaces();
  const espace = liste.find((e) => e.id === id);
  if (!espace) return null;
  if (espace.logo && !fourni(espace.logo)) await createServiceClient().storage.from(SEAU).remove([espace.logo]);
  const maj = { ...espace, logo: null, updated_at: new Date().toISOString() };
  await ecrire(liste.map((e) => (e.id === id ? maj : e)));
  return maj;
}

/** Le logo d'un espace, prêt à être servi ou posé sur un PDF. */
export async function lireLogo(espace: Pick<EspacePro, "logo">): Promise<{ type: string; donnees: Buffer } | null> {
  if (!espace.logo) return null;
  if (fourni(espace.logo)) {
    // path.basename : le nom du fichier seulement, quoi que contienne le chemin.
    const fichier = path.basename(espace.logo);
    const donnees = await readFile(path.join(DOSSIER_LOGOS, fichier)).catch(() => null);
    return donnees ? { type: fichier.endsWith(".png") ? "image/png" : "image/jpeg", donnees } : null;
  }
  const { data, error } = await createServiceClient().storage.from(SEAU).download(espace.logo);
  if (error || !data) return null;
  return {
    type: espace.logo.endsWith(".png") ? "image/png" : "image/jpeg",
    donnees: Buffer.from(await data.arrayBuffer()),
  };
}

/** Combien de demandes chaque espace a reçues — pour la liste de l'espace équipe. */
export async function compterDemandesParEspace(): Promise<Record<string, number>> {
  const { data } = await createServiceClient()
    .from("requests")
    .select("espace:raw_payload->espace->>slug")
    .not("raw_payload->espace", "is", null);
  const total: Record<string, number> = {};
  for (const ligne of (data ?? []) as { espace: string | null }[]) {
    if (ligne.espace) total[ligne.espace] = (total[ligne.espace] ?? 0) + 1;
  }
  return total;
}
