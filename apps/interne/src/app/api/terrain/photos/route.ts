import { NextResponse } from "next/server";
import { exigerPorteur } from "@/terrain/lib/acces";
import { equipeAuPlanning, jourParis, peutOuvrir } from "@/terrain/lib/planning";
import { assurerSeau, deposer, enregistrer, photoParCle, retirerFichiers, typeImage } from "@/terrain/lib/photos";
import { PLAFOND_NOTE, PLAFOND_PHOTO, PLAFOND_VIGNETTE, estCategorie } from "@/terrain/regles";

export const dynamic = "force-dynamic";

/*
 * POST /api/terrain/photos — une photo de chantier, envoyée depuis l'outil
 * terrain (une requête par photo, pour suivre la progression de chacune et
 * ne renvoyer que celle qui a échoué).
 *
 * Le formulaire porte : cle (identifiant de la photo, tiré par le
 * navigateur), dossier, categorie (avant, apres, detail), note, lat, lng,
 * precision (si le téléphone a donné sa position), prise_appareil (heure de
 * l'appareil, en millisecondes), largeur, hauteur, photo et vignette.
 *
 * Le serveur vérifie la session et le droit au dossier, lit le type de
 * l'image dans ses octets, dépose les fichiers dans le seau privé et
 * enregistre la ligne, horodatée à la réception. Une photo renvoyée avec la
 * même clé (réponse perdue en route, nouvel essai) n'est enregistrée qu'une
 * fois : la réponse est la même.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const refus = (erreur: string, status: number) => NextResponse.json({ erreur }, { status });

function nombre(v: FormDataEntryValue | null, min: number, max: number) {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export async function POST(req: Request) {
  let porteur;
  try {
    porteur = await exigerPorteur();
  } catch (e) {
    return refus(e instanceof Error ? e.message : "Session expirée : reconnectez-vous.", 401);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return refus("Envoi illisible : réessayez.", 400);

  const cle = String(form.get("cle") ?? "").toLowerCase();
  const dossierId = Number(form.get("dossier"));
  const categorie = form.get("categorie");
  const photo = form.get("photo");
  const vignette = form.get("vignette");
  if (!UUID.test(cle)) return refus("Envoi incomplet : la clé de la photo manque.", 400);
  if (!estCategorie(categorie)) return refus("Choisissez avant, après ou détail.", 400);
  if (!(photo instanceof File) || photo.size === 0) return refus("La photo manque.", 400);
  if (photo.size > PLAFOND_PHOTO) return refus("Photo trop lourde (15 Mo au plus).", 413);
  if (vignette instanceof File && vignette.size > PLAFOND_VIGNETTE) return refus("Vignette trop lourde.", 413);
  if (!(await peutOuvrir(porteur, dossierId))) return refus("Ce dossier n'est pas au planning d'aujourd'hui.", 403);

  // Déjà reçue (réponse perdue, nouvel essai) : même réponse, rien de plus.
  const deja = await photoParCle(cle);
  if (deja) return deja.dossierId === dossierId ? NextResponse.json({ id: deja.id, priseLe: deja.priseLe, deja: true }) : refus("Clé déjà utilisée.", 409);

  const octets = Buffer.from(await photo.arrayBuffer());
  const genre = typeImage(octets);
  if (!genre) return refus("Ce fichier n'est pas une photo (JPEG, PNG, WebP ou HEIC).", 415);
  const octetsV = vignette instanceof File && vignette.size > 0 ? Buffer.from(await vignette.arrayBuffer()) : null;
  const vignetteOk = octetsV && typeImage(octetsV)?.type === "image/jpeg" ? octetsV : null;

  const note = String(form.get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, PLAFOND_NOTE) || null;
  const latitude = nombre(form.get("lat"), -90, 90);
  const longitude = nombre(form.get("lng"), -180, 180);
  const position = latitude !== null && longitude !== null;
  const ms = nombre(form.get("prise_appareil"), Date.now() - 365 * 864e5, Date.now() + 864e5);

  try {
    await assurerSeau();
    const jour = await jourParis();
    const base = `dossiers/${dossierId}/${jour}/${cle}`;
    const chemin = `${base}.${genre.ext}`;
    const cheminVignette = vignetteOk ? `${base}-v.jpg` : null;
    await deposer(chemin, octets, genre.type);
    if (vignetteOk && cheminVignette) await deposer(cheminVignette, vignetteOk, "image/jpeg");

    const equipe = porteur.equipe ?? (await equipeAuPlanning(dossierId));
    const r = await enregistrer({
      cle,
      dossierId,
      agentId: porteur.genre === "agent" ? porteur.agent.id : null,
      utilisateurId: porteur.genre === "bureau" ? porteur.utilisateurId : null,
      auteur: porteur.nom,
      equipe,
      categorie,
      note,
      priseAppareil: ms !== null ? new Date(ms) : null,
      latitude: position ? latitude : null,
      longitude: position ? longitude : null,
      precision: position ? nombre(form.get("precision"), 0, 100_000) : null,
      chemin,
      cheminVignette,
      type: genre.type,
      taille: octets.length,
      largeur: nombre(form.get("largeur"), 1, 20_000),
      hauteur: nombre(form.get("hauteur"), 1, 20_000),
    }).catch(async (e) => {
      // La ligne n'a pas pu s'écrire : les fichiers ne restent pas orphelins.
      await retirerFichiers([chemin, cheminVignette]).catch(() => undefined);
      throw e;
    });
    if (!r) return refus("La photo n'a pas pu être enregistrée : réessayez.", 500);
    return NextResponse.json({ id: r.id, priseLe: r.priseLe }, { status: 201 });
  } catch (e) {
    console.error("Outil terrain : envoi d'une photo", e);
    return refus("Le serveur n'a pas pu garder la photo : réessayez dans un instant.", 502);
  }
}
