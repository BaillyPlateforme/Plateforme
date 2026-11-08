"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone } from "@/ui/icones";
import { apercuPossible, estImage, estPdf, jourHeure, tailleLisible, type Apercable } from "./outils";
import s from "./suivi.module.css";

/**
 * L'aperçu d'une pièce jointe, dans la page : l'image ou le PDF, son nom, qui
 * l'a fournie et quand, et de quoi la télécharger. Les flèches (et ← →)
 * passent aux pièces voisines ; Échap ferme.
 *
 * Les adresses sont celles de la porte de l'équipe : un lien signé de cinq
 * minutes, qui renvoie vers une adresse du stockage valable une minute.
 */
export function Visionneuse({ fichiers, index, changer, fermer }: { fichiers: Apercable[]; index: number; changer: (i: number) => void; fermer: () => void }) {
  const f = fichiers[index];
  const n = fichiers.length;
  const boite = useRef<HTMLDivElement>(null);
  const [charge, setCharge] = useState<string | null>(null);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      else if (e.key === "ArrowRight" && n > 1) changer((index + 1) % n);
      else if (e.key === "ArrowLeft" && n > 1) changer((index - 1 + n) % n);
    };
    document.addEventListener("keydown", touche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", touche);
      document.body.style.overflow = avant;
    };
  }, [index, n, changer, fermer]);

  useEffect(() => {
    boite.current?.focus();
  }, []);

  if (!f) return null;
  const meta = [f.categorie, f.par && `par ${f.par}`, f.le && jourHeure(f.le), tailleLisible(f.taille)].filter(Boolean).join(" · ");
  const pret = charge === f.cle;

  return createPortal(
    <div className={`vue-equipe ${s.voile}`} onClick={fermer}>
      <div ref={boite} tabIndex={-1} className={s.visionneuse} role="dialog" aria-modal="true" aria-label={`Aperçu : ${f.libelle}`} onClick={(e) => e.stopPropagation()}>
        <header className={s.visionTete}>
          <span className={s.visionPicto} data-type={estPdf(f.mime) ? "pdf" : estImage(f.mime) ? "image" : "autre"}>
            <Icone nom={estImage(f.mime) ? "image" : "fichier"} taille={18} />
          </span>
          <div className={s.visionTitre}>
            <h2>{f.libelle}</h2>
            <p>
              {f.nom}
              {meta && <> · {meta}</>}
            </p>
          </div>
          <div className={s.visionGestes}>
            {n > 1 && (
              <span className={s.visionCompte}>
                {index + 1} / {n}
              </span>
            )}
            <a className={s.boutonClair} href={f.telecharger} download>
              <Icone nom="telecharger" taille={16} />
              Télécharger
            </a>
            <a className={s.boutonIcone} href={f.lien} target="_blank" rel="noopener" title="Ouvrir dans un nouvel onglet" aria-label="Ouvrir dans un nouvel onglet">
              <Icone nom="externe" taille={16} />
            </a>
            <button type="button" className={s.boutonIcone} onClick={fermer} title="Fermer (Échap)" aria-label="Fermer l'aperçu">
              <Icone nom="fermer" taille={17} />
            </button>
          </div>
        </header>
        <div className={s.visionCorps} data-type={estPdf(f.mime) ? "pdf" : "image"}>
          {!pret && apercuPossible(f.mime) && <span className={s.visionAttente} aria-hidden />}
          {estImage(f.mime) ? (
            // eslint-disable-next-line @next/next/no-img-element -- une adresse signée qui redirige vers le stockage : pas d'optimisation d'image
            <img key={f.cle} src={f.lien} alt={f.libelle} onLoad={() => setCharge(f.cle)} data-pret={pret ? "" : undefined} />
          ) : estPdf(f.mime) ? (
            <iframe key={f.cle} src={`${f.lien}#view=FitH&navpanes=0`} title={f.libelle} onLoad={() => setCharge(f.cle)} />
          ) : (
            <div className={s.visionVide}>
              <Icone nom="fichier" taille={34} />
              <p>
                <b>Aperçu indisponible pour ce format</b>
                {f.mime.includes("hei") ? "Photo HEIC (iPhone) : votre navigateur ne l'affiche pas." : "Ce fichier ne s'affiche pas dans le navigateur."} Téléchargez-le pour l&apos;ouvrir.
              </p>
              <a className={s.boutonPlein} href={f.telecharger} download>
                <Icone nom="telecharger" taille={16} />
                Télécharger
              </a>
            </div>
          )}
          {n > 1 && (
            <>
              <button type="button" className={`${s.visionFleche} ${s.gauche}`} onClick={() => changer((index - 1 + n) % n)} aria-label="Pièce précédente">
                <Icone nom="gauche" taille={20} />
              </button>
              <button type="button" className={`${s.visionFleche} ${s.droite}`} onClick={() => changer((index + 1) % n)} aria-label="Pièce suivante">
                <Icone nom="droite" taille={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
