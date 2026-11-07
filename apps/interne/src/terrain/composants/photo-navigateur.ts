/*
 * La préparation d'une photo dans le navigateur, partagée par l'outil
 * terrain (Capture) et la tablette de visite technique :
 *
 *   - réduite à 2 400 px de côté au plus (une photo de téléphone de 4 à
 *     12 Mo tombe sous le mégaoctet), et une vignette de 480 px ;
 *   - envoyée par XMLHttpRequest, qui dit où en est l'envoi (fetch, non) ;
 *   - identifiée par une clé tirée ici : un renvoi dont la première réponse
 *     s'est perdue n'en fait pas deux.
 */

import { COTE_PHOTO, COTE_VIGNETTE } from "../regles";

export const nouvelleCle = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

function reduire(img: HTMLImageElement, L: number, H: number, cote: number, qualite: number): Promise<Blob | null> {
  const r = Math.min(1, cote / Math.max(L, H));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(L * r));
  c.height = Math.max(1, Math.round(H * r));
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) =>
    c.toBlob(
      (b) => {
        // Libère la mémoire du canevas tout de suite : un vieux téléphone n'en a pas à revendre.
        c.width = 0;
        c.height = 0;
        ok(b);
      },
      "image/jpeg",
      qualite,
    ),
  );
}

export type PhotoPreparee = { photo?: Blob; vignette?: Blob | null; largeur?: number; hauteur?: number };

/** Réduit une photo et en tire la vignette. Un format que le navigateur ne sait pas lire part tel quel. */
export async function preparer(f: File): Promise<PhotoPreparee> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // Les navigateurs récents redressent la photo d'après son orientation EXIF : la taille lue est celle à l'endroit.
    const L = img.naturalWidth;
    const H = img.naturalHeight;
    const vignette = await reduire(img, L, H, COTE_VIGNETTE, 0.72);
    const dejaLegere = f.type === "image/jpeg" && f.size <= 1.5 * 1024 * 1024 && Math.max(L, H) <= COTE_PHOTO;
    if (dejaLegere) return { photo: f, vignette, largeur: L, hauteur: H };
    const photo = await reduire(img, L, H, COTE_PHOTO, 0.85);
    const r = Math.min(1, COTE_PHOTO / Math.max(L, H));
    return photo ? { photo, vignette, largeur: Math.round(L * r), hauteur: Math.round(H * r) } : { photo: f, vignette };
  } catch {
    return { photo: f, vignette: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Reponse<T = { id?: number; priseLe?: string; erreur?: string }> = { statut: number; corps: T | null };

/** L'envoi d'un formulaire, avec sa progression. Statut 0 : le réseau a manqué. */
export function poster<T = { id?: number; priseLe?: string; erreur?: string }>(url: string, fd: FormData, progres: (p: number) => void): Promise<Reponse<T>> {
  return new Promise((fin) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.timeout = 120_000;
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) progres(e.loaded / e.total);
    };
    x.onload = () => {
      let corps = null;
      try {
        corps = JSON.parse(x.responseText);
      } catch {
        // Une réponse qui n'est pas du JSON : le statut suffit.
      }
      fin({ statut: x.status, corps });
    };
    x.onerror = () => fin({ statut: 0, corps: null });
    x.ontimeout = () => fin({ statut: 0, corps: null });
    x.send(fd);
  });
}
