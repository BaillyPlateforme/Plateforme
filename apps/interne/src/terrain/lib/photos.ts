import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { q, q1 } from "@/crm/lib/db";
import { PLAFOND_PHOTO, type Categorie, type PhotoVue } from "../regles";

/*
 * Les photos de chantier.
 *
 * Les fichiers vont dans le seau privé « photos-chantier » de Supabase
 * Storage, sous dossiers/<dossier>/<jour>/<clé>.jpg (et -v.jpg pour la
 * vignette faite par le navigateur). Aucune politique n'y ouvre la clé
 * publique : seul le serveur dépose et lit, avec la clé de service. Le seau
 * est créé à la première photo s'il manque.
 *
 * Une photo ne sort que par /api/terrain/photos/<id>, qui vérifie la session
 * et le droit au dossier puis renvoie vers une URL signée du seau, valable
 * une minute : un lien recopié ailleurs ne sert plus à rien.
 *
 * La ligne crm.photos_chantier porte l'horodatage du serveur (prise_le, à la
 * réception : c'est lui qui fait foi), l'heure de l'appareil pour
 * information, et la position si le téléphone l'a donnée.
 */

export const SEAU = "photos-chantier";
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const DUREE_URL_S = 60;

const g = globalThis as typeof globalThis & { __seauPhotosChantier?: Promise<void> };

/** Le seau existe-t-il ? Créé sinon, privé, une fois par processus. */
export function assurerSeau() {
  g.__seauPhotosChantier ??= (async () => {
    const stockage = createServiceClient().storage;
    const { data } = await stockage.getBucket(SEAU);
    if (data) return;
    const { error } = await stockage.createBucket(SEAU, { public: false, fileSizeLimit: PLAFOND_PHOTO, allowedMimeTypes: TYPES });
    if (error && !/exist/i.test(error.message)) throw new Error(`Création du stockage des photos impossible : ${error.message}`);
  })().catch((e) => {
    g.__seauPhotosChantier = undefined;
    throw e;
  });
  return g.__seauPhotosChantier;
}

/** Le type d'une image, lu dans ses premiers octets (le navigateur peut se tromper, ou mentir). */
export function typeImage(o: Buffer): { type: string; ext: string } | null {
  if (o.length < 12) return null;
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (o[0] === 0x89 && o.toString("ascii", 1, 4) === "PNG") return { type: "image/png", ext: "png" };
  if (o.toString("ascii", 0, 4) === "RIFF" && o.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (o.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1|heif)$/.test(o.toString("ascii", 8, 12)))
    return { type: "image/heic", ext: "heic" };
  return null;
}

export async function deposer(chemin: string, donnees: Buffer, type: string) {
  // Même chemin à chaque essai (il porte la clé de la photo) : un renvoi remplace, il ne double pas.
  const { error } = await createServiceClient().storage.from(SEAU).upload(chemin, donnees, { contentType: type, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`Dépôt de la photo impossible : ${error.message}`);
}

export async function retirerFichiers(chemins: (string | null)[]) {
  const liste = chemins.filter((c): c is string => !!c);
  if (liste.length) await createServiceClient().storage.from(SEAU).remove(liste);
}

export async function urlSignee(chemin: string, telecharger?: string) {
  const { data, error } = await createServiceClient()
    .storage.from(SEAU)
    .createSignedUrl(chemin, DUREE_URL_S, telecharger ? { download: telecharger } : undefined);
  if (error || !data) throw new Error(`Lien de la photo impossible : ${error?.message ?? "réponse vide"}`);
  return data.signedUrl;
}

export type Photo = PhotoVue & { dossierId: number; largeur: number | null; hauteur: number | null; taille: number };

/** Les colonnes d'une photo, toutes préfixées par la table (`p`) : rien d'ambigu dans une jointure. */
const COLONNES = `p.id, p.dossier_id as "dossierId", p.categorie, p.note, p.auteur, p.equipe, p.agent_id as "agentId",
  to_char(p.prise_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "priseLe",
  to_char(p.prise_appareil at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "priseAppareil",
  (p.prise_le at time zone 'Europe/Paris')::date::text as jour,
  p.latitude, p.longitude, p.precision_m as precision, p.largeur, p.hauteur, p.taille, p.chemin_vignette is not null as vignette, p.demo`;

export const photosDuDossier = (dossierId: number) =>
  q<Photo>(`select ${COLONNES} from photos_chantier p where p.dossier_id = $1 order by p.prise_le desc, p.id desc`, [dossierId]);

export const photoParId = (id: number) =>
  q1<Photo & { chemin: string; cheminVignette: string | null; ref: string }>(
    `select ${COLONNES}, p.chemin, p.chemin_vignette as "cheminVignette", d.ref
     from photos_chantier p join dossiers d on d.id = p.dossier_id where p.id = $1`,
    [id],
  );

export const photoParCle = (cle: string) => q1<{ id: number; dossierId: number; priseLe: string }>(
  `select id, dossier_id as "dossierId", to_char(prise_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "priseLe" from photos_chantier where cle = $1`,
  [cle],
);

export type NouvellePhoto = {
  cle: string;
  dossierId: number;
  agentId: number | null;
  utilisateurId: number | null;
  auteur: string;
  equipe: string | null;
  categorie: Categorie;
  note: string | null;
  priseAppareil: Date | null;
  latitude: number | null;
  longitude: number | null;
  precision: number | null;
  chemin: string;
  cheminVignette: string | null;
  type: string;
  taille: number;
  largeur: number | null;
  hauteur: number | null;
};

/** Enregistre la photo ; la même clé renvoyée deux fois n'en fait qu'une. */
export async function enregistrer(p: NouvellePhoto) {
  const r = await q1<{ id: number; priseLe: string }>(
    `insert into photos_chantier (cle, dossier_id, agent_id, utilisateur_id, auteur, equipe, categorie, note, prise_appareil,
       latitude, longitude, precision_m, chemin, chemin_vignette, type, taille, largeur, hauteur)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     on conflict (cle) do nothing
     returning id, to_char(prise_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "priseLe"`,
    [p.cle, p.dossierId, p.agentId, p.utilisateurId, p.auteur, p.equipe, p.categorie, p.note, p.priseAppareil,
      p.latitude, p.longitude, p.precision, p.chemin, p.cheminVignette, p.type, p.taille, p.largeur, p.hauteur],
  );
  return r ?? (await photoParCle(p.cle));
}

/** Les chiffres de la page Déménageurs : photos du jour (à Paris), de la semaine, dossiers photographiés. */
export async function chiffresPhotos() {
  const r = await q1<{ jour: number; semaine: number; dossiers: number }>(
    `select count(*) filter (where (prise_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)::int as jour,
       count(*) filter (where prise_le > now() - interval '7 days')::int as semaine,
       count(distinct dossier_id) filter (where prise_le > now() - interval '7 days')::int as dossiers
     from photos_chantier`,
  );
  return r ?? { jour: 0, semaine: 0, dossiers: 0 };
}

/** Retire une photo : la ligne, puis ses fichiers. Rend la ligne retirée. */
export async function supprimer(id: number) {
  const r = await q1<{ dossierId: number; chemin: string; cheminVignette: string | null; categorie: string; auteur: string }>(
    `delete from photos_chantier where id = $1
     returning dossier_id as "dossierId", chemin, chemin_vignette as "cheminVignette", categorie, auteur`,
    [id],
  );
  if (r) await retirerFichiers([r.chemin, r.cheminVignette]).catch(() => undefined);
  return r;
}
