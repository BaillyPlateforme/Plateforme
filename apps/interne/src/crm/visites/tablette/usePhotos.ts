"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nouvelleCle, poster, preparer } from "@/terrain/composants/photo-navigateur";
import { urlPhotoVisite } from "./etat";
import { garderPhoto, oublierPhoto, photosLocales, type PhotoLocale } from "./photos-locales";

/*
 * Les photos de la visite, pièce par pièce. Chacune est préparée dans le
 * navigateur (réduite, avec sa vignette, comme celles de l'outil terrain),
 * gardée sur la tablette (photos-locales.ts), puis envoyée seule avec sa
 * progression, l'une après l'autre. Sans réseau, elle attend sur la tablette
 * et part d'elle-même au retour du réseau ; une photo refusée n'arrête pas
 * les autres. La pièce doit être enregistrée au serveur avant sa première
 * photo : la file de la saisie part d'abord. Une photo renvoyée garde sa clé :
 * le serveur ne la garde qu'une fois.
 */

export type PhotoTablette = {
  cle: string;
  piece: string;
  id: number | null;
  /** attente : gardée sur la tablette, elle partira dès que possible. */
  etat: "preparation" | "attente" | "envoi" | "ok" | "echec";
  progression: number;
  apercu: string | null;
  vignette: boolean;
  erreur?: string;
  local?: PhotoLocale;
  essais?: number;
};

const SANS_RESEAU = "Gardée sur la tablette : partira au retour du réseau.";

export function usePhotos(visiteId: number, initiales: { id: number; cle: string; piece: string | null; vignette: boolean }[], vider: () => Promise<boolean>) {
  const [photos, setPhotosEtat] = useState<PhotoTablette[]>(() =>
    initiales.filter((p) => p.piece).map((p) => ({ cle: p.cle, piece: p.piece!, id: p.id, etat: "ok", progression: 1, apercu: null, vignette: p.vignette })),
  );
  const ref = useRef(photos);
  const setPhotos = useCallback((f: (l: PhotoTablette[]) => PhotoTablette[]) => {
    ref.current = f(ref.current);
    setPhotosEtat(ref.current);
  }, []);
  const maj = useCallback((cle: string, patch: Partial<PhotoTablette>) => setPhotos((l) => l.map((p) => (p.cle === cle ? { ...p, ...patch } : p))), [setPhotos]);
  const enCours = photos.some((p) => p.etat === "preparation" || p.etat === "envoi" || p.etat === "attente");
  const enAttente = photos.filter((p) => p.etat === "preparation" || p.etat === "envoi" || p.etat === "attente").length;
  const apercus = useRef<string[]>([]);
  const actif = useRef(false);
  const apercu = (b: Blob) => {
    const u = URL.createObjectURL(b);
    apercus.current.push(u);
    return u;
  };

  // Quitter la page pendant qu'une photo se prépare (elle n'est pas encore gardée) : le navigateur demande confirmation.
  const enPreparation = photos.some((p) => p.etat === "preparation");
  useEffect(() => {
    if (!enPreparation) return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [enPreparation]);

  useEffect(() => () => apercus.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /** Envoie une photo gardée. Rend vrai s'il faut continuer avec la suivante. */
  const envoyerUne = useCallback(
    async (p: PhotoTablette): Promise<boolean> => {
      const l = p.local!;
      maj(p.cle, { etat: "envoi", progression: 0, erreur: undefined });
      // La pièce doit être connue du serveur : la saisie part d'abord. Sans réseau, la photo attend.
      if (!(await vider()) && !navigator.onLine) {
        maj(p.cle, { etat: "attente", progression: 0, erreur: SANS_RESEAU });
        return false;
      }
      const fd = new FormData();
      fd.set("cle", l.cle);
      fd.set("piece", l.piece);
      fd.set("photo", l.photo, "photo.jpg");
      if (l.vignette) fd.set("vignette", l.vignette, "vignette.jpg");
      if (l.largeur) fd.set("largeur", String(l.largeur));
      if (l.hauteur) fd.set("hauteur", String(l.hauteur));
      const r = await poster<{ id?: number; vignette?: boolean; erreur?: string }>(`/api/visites/${visiteId}/photos`, fd, (x) => maj(p.cle, { progression: x }));
      if (r.statut >= 200 && r.statut < 300 && r.corps?.id) {
        await oublierPhoto(l.cle);
        maj(p.cle, { etat: "ok", id: r.corps.id, progression: 1, vignette: r.corps.vignette ?? true, local: undefined, erreur: undefined });
        return true;
      }
      // La pièce n'était pas encore arrivée : un instant, puis on réessaie (cinq fois au plus).
      if (r.statut === 409 && /pièce/.test(r.corps?.erreur ?? "") && (p.essais ?? 0) < 5) {
        maj(p.cle, { etat: "attente", essais: (p.essais ?? 0) + 1 });
        await new Promise((x) => setTimeout(x, 1200));
        return true;
      }
      if (r.statut === 0 || r.statut >= 500 || r.statut === 401) {
        maj(p.cle, { etat: "attente", progression: 0, erreur: r.statut === 401 ? "Session expirée : elle partira après la reconnexion." : SANS_RESEAU });
        return false;
      }
      // Refusée (compte-rendu signé, fichier illisible…) : elle reste sur la tablette, le commercial décide.
      maj(p.cle, { etat: "echec", erreur: r.corps?.erreur ?? "Envoi refusé." });
      return true;
    },
    [maj, vider, visiteId],
  );

  /** Les photos en attente partent, l'une après l'autre, tant que le réseau répond. */
  const pousser = useCallback(async () => {
    if (actif.current) return;
    actif.current = true;
    try {
      for (let n = 0; n < 500; n++) {
        const p = ref.current.find((x) => x.etat === "attente" && x.local);
        if (!p || !(await envoyerUne(p))) break;
      }
    } finally {
      actif.current = false;
    }
  }, [envoyerUne]);

  // À l'ouverture : les photos restées sur la tablette (prises sans réseau, onglet fermé…) reprennent leur place, puis partent.
  useEffect(() => {
    let fini = false;
    void photosLocales(visiteId).then(async (locales) => {
      if (fini || !locales.length) return;
      const recues = new Set(ref.current.filter((p) => p.id).map((p) => p.cle));
      for (const l of locales.filter((x) => recues.has(x.cle))) await oublierPhoto(l.cle);
      const reste = locales.filter((x) => !recues.has(x.cle) && !ref.current.some((p) => p.cle === x.cle));
      setPhotos((l) => [
        ...l,
        ...reste.map((x) => ({ cle: x.cle, piece: x.piece, id: null, etat: "attente" as const, progression: 0, apercu: apercu(x.vignette ?? x.photo), vignette: false, local: x })),
      ]);
      void pousser();
    });
    return () => {
      fini = true;
    };
  }, [visiteId, pousser, setPhotos]);

  // Le réseau revient : les photos en attente partent. Et un nouvel essai régulier, au cas où.
  useEffect(() => {
    const relancer = () => {
      if (navigator.onLine) void pousser();
    };
    window.addEventListener("online", relancer);
    const t = window.setInterval(() => ref.current.some((p) => p.etat === "attente") && relancer(), 20_000);
    return () => {
      window.removeEventListener("online", relancer);
      window.clearInterval(t);
    };
  }, [pousser]);

  const ajouter = useCallback(
    (piece: string, fichiers: File[]) => {
      void (async () => {
        for (const f of fichiers) {
          const cle = nouvelleCle();
          setPhotos((l) => [...l, { cle, piece, id: null, etat: "preparation", progression: 0, apercu: apercu(f), vignette: false }]);
          const prep = await preparer(f);
          const local: PhotoLocale = {
            cle, visite: visiteId, piece, photo: prep.photo ?? f, vignette: prep.vignette ?? null, largeur: prep.largeur, hauteur: prep.hauteur, le: Date.now(),
          };
          await garderPhoto(local);
          maj(cle, { etat: "attente", local });
        }
        void pousser();
      })();
    },
    [maj, pousser, setPhotos, visiteId],
  );

  const renvoyer = useCallback(
    (p: PhotoTablette) => {
      if (!p.local) return;
      maj(p.cle, { etat: "attente", erreur: undefined, essais: 0 });
      void pousser();
    },
    [maj, pousser],
  );

  const retirer = useCallback(
    async (p: PhotoTablette) => {
      if (p.id) {
        const r = await fetch(urlPhotoVisite(p.id, false), { method: "DELETE" }).catch(() => null);
        if (!r?.ok) {
          maj(p.cle, { erreur: r ? "Retrait impossible pour l'instant." : "Hors connexion : retirez-la au retour du réseau." });
          return;
        }
      } else await oublierPhoto(p.cle);
      setPhotos((l) => l.filter((x) => x.cle !== p.cle));
    },
    [maj, setPhotos],
  );

  /** Les photos d'une pièce retirée : elles partent avec elle (le serveur a déjà retiré les siennes). */
  const oublierPiece = useCallback(
    (piece: string) => {
      for (const p of ref.current) if (p.piece === piece && !p.id) void oublierPhoto(p.cle);
      setPhotos((l) => l.filter((p) => p.piece !== piece));
    },
    [setPhotos],
  );

  return { photos, ajouter, renvoyer, retirer, oublierPiece, enCours, enAttente, pousser };
}
