"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nouvelleCle, poster, preparer } from "@/terrain/composants/photo-navigateur";
import { urlPhotoVisite } from "./etat";

/*
 * Les photos de la visite, pièce par pièce. Chacune est préparée dans le
 * navigateur (réduite, avec sa vignette, comme celles de l'outil terrain),
 * puis envoyée seule avec sa progression ; une photo qui échoue n'arrête pas
 * les autres, et se renvoie d'un geste. La pièce doit être enregistrée au
 * serveur avant sa première photo : la file de la saisie est vidée d'abord.
 *
 * Une photo pas encore envoyée vit dans la mémoire de l'onglet : le
 * navigateur le rappelle si l'on quitte la page avant la fin de l'envoi
 * (le mode hors ligne est hors du périmètre, cahier des charges §3.2).
 */

export type PhotoTablette = {
  cle: string;
  piece: string;
  id: number | null;
  etat: "preparation" | "envoi" | "ok" | "echec";
  progression: number;
  apercu: string | null;
  vignette: boolean;
  erreur?: string;
  fichier?: File;
};

export function usePhotos(visiteId: number, initiales: { id: number; cle: string; piece: string | null; vignette: boolean }[], vider: () => Promise<boolean>) {
  const [photos, setPhotos] = useState<PhotoTablette[]>(() =>
    initiales.filter((p) => p.piece).map((p) => ({ cle: p.cle, piece: p.piece!, id: p.id, etat: "ok", progression: 1, apercu: null, vignette: p.vignette })),
  );
  const maj = useCallback((cle: string, patch: Partial<PhotoTablette>) => setPhotos((l) => l.map((p) => (p.cle === cle ? { ...p, ...patch } : p))), []);
  const enCours = photos.some((p) => p.etat === "preparation" || p.etat === "envoi");
  const apercus = useRef<string[]>([]);

  // Quitter la page pendant un envoi : le navigateur demande confirmation.
  useEffect(() => {
    if (!enCours) return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [enCours]);

  useEffect(() => () => apercus.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const envoyer = useCallback(
    async (p: Pick<PhotoTablette, "cle" | "piece">, fichier: File) => {
      maj(p.cle, { etat: "preparation", progression: 0, erreur: undefined });
      // La pièce doit être connue du serveur : la saisie part d'abord.
      await vider();
      const prep = await preparer(fichier);
      const fd = new FormData();
      fd.set("cle", p.cle);
      fd.set("piece", p.piece);
      fd.set("photo", prep.photo ?? fichier, "photo.jpg");
      if (prep.vignette) fd.set("vignette", prep.vignette, "vignette.jpg");
      if (prep.largeur) fd.set("largeur", String(prep.largeur));
      if (prep.hauteur) fd.set("hauteur", String(prep.hauteur));
      maj(p.cle, { etat: "envoi" });
      for (let essai = 0; essai < 3; essai++) {
        const r = await poster<{ id?: number; vignette?: boolean; erreur?: string }>(`/api/visites/${visiteId}/photos`, fd, (x) => maj(p.cle, { progression: x }));
        if (r.statut >= 200 && r.statut < 300 && r.corps?.id) {
          maj(p.cle, { etat: "ok", id: r.corps.id, progression: 1, vignette: r.corps.vignette ?? true, fichier: undefined });
          return;
        }
        // La pièce n'était pas encore arrivée : un instant, puis on réessaie.
        if (r.statut === 409 && /pièce/.test(r.corps?.erreur ?? "")) {
          await vider();
          await new Promise((x) => setTimeout(x, 800));
          continue;
        }
        if (r.statut !== 0) {
          maj(p.cle, { etat: "echec", erreur: r.corps?.erreur ?? "Envoi refusé." });
          return;
        }
        await new Promise((x) => setTimeout(x, 2000 * (essai + 1)));
      }
      maj(p.cle, { etat: "echec", erreur: "Pas de réseau : touchez pour renvoyer." });
    },
    [maj, vider, visiteId],
  );

  const ajouter = useCallback(
    (piece: string, fichiers: File[]) => {
      for (const f of fichiers) {
        const apercu = URL.createObjectURL(f);
        apercus.current.push(apercu);
        const p: PhotoTablette = { cle: nouvelleCle(), piece, id: null, etat: "preparation", progression: 0, apercu, vignette: false, fichier: f };
        setPhotos((l) => [...l, p]);
        void envoyer(p, f);
      }
    },
    [envoyer],
  );

  const renvoyer = useCallback((p: PhotoTablette) => p.fichier && void envoyer(p, p.fichier), [envoyer]);

  const retirer = useCallback(
    async (p: PhotoTablette) => {
      if (p.id) {
        const r = await fetch(urlPhotoVisite(p.id, false), { method: "DELETE" }).catch(() => null);
        if (!r?.ok) {
          maj(p.cle, { erreur: "Retrait impossible pour l'instant." });
          return;
        }
      }
      setPhotos((l) => l.filter((x) => x.cle !== p.cle));
    },
    [maj],
  );

  /** Les photos d'une pièce retirée : elles partent avec elle (le serveur les a déjà retirées). */
  const oublierPiece = useCallback((piece: string) => setPhotos((l) => l.filter((p) => p.piece !== piece)), []);

  return { photos, ajouter, renvoyer, retirer, oublierPiece, enCours };
}
