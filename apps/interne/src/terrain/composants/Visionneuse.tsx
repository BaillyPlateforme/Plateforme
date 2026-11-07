"use client";

import { useEffect, useRef, useState } from "react";
import { ecartAppareil, libelleCategorie, momentParis, urlCarte, urlPhoto, type PhotoVue } from "../regles";
import { Picto } from "./Picto";
import v from "./visionneuse.module.css";

/*
 * L'agrandissement d'une photo de chantier, pour l'outil terrain comme pour
 * la galerie du CRM : la photo en grand sur fond sombre, ce qui fait d'elle
 * une preuve (qui, quand selon le serveur, où), et les gestes — précédente,
 * suivante (flèches, glisser), télécharger, et ce que la page ajoute.
 */
export default function Visionneuse({
  photos,
  index,
  onFermer,
  onAller,
  actions,
}: {
  photos: PhotoVue[];
  index: number;
  onFermer: () => void;
  onAller: (i: number) => void;
  actions?: (p: PhotoVue) => React.ReactNode;
}) {
  const p = photos[index];
  const fermer = useRef<HTMLButtonElement>(null);
  const depart = useRef<number | null>(null);
  const [chargee, setChargee] = useState<number | null>(null);

  useEffect(() => {
    fermer.current?.focus();
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
      if (e.key === "ArrowLeft" && index > 0) onAller(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onAller(index + 1);
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [index, photos.length, onAller, onFermer]);

  if (!p) return null;
  const ecart = ecartAppareil(p);

  return (
    <div className={v.voile} role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} sur ${photos.length}`}>
      <div className={v.haut}>
        <span className={v.compteur}>
          {index + 1} / {photos.length}
        </span>
        <button ref={fermer} type="button" className={v.rond} onClick={onFermer} aria-label="Fermer">
          <Picto nom="croix" />
        </button>
      </div>

      <div
        className={v.scene}
        onPointerDown={(e) => {
          depart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (depart.current === null) return;
          const dx = e.clientX - depart.current;
          depart.current = null;
          if (dx > 60 && index > 0) onAller(index - 1);
          if (dx < -60 && index < photos.length - 1) onAller(index + 1);
        }}
      >
        {/* La vignette tient la place pendant que la grande photo arrive. Des URL signées d'une minute : pas d'optimisation d'image. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus */}
        {p.vignette && chargee !== p.id && <img className={v.flou} src={urlPhoto(p.id, { vignette: true })} alt="" aria-hidden />}
        {/* eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus */}
        <img
          key={p.id}
          className={`${v.image} ${chargee === p.id ? v.visible : ""}`}
          src={urlPhoto(p.id)}
          alt={`Photo ${libelleCategorie(p.categorie).toLowerCase()} envoyée par ${p.auteur}`}
          onLoad={() => setChargee(p.id)}
          draggable={false}
        />
        {index > 0 && (
          <button type="button" className={`${v.rond} ${v.precedente}`} onClick={() => onAller(index - 1)} aria-label="Photo précédente">
            <Picto nom="retour" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button type="button" className={`${v.rond} ${v.suivante}`} onClick={() => onAller(index + 1)} aria-label="Photo suivante">
            <Picto nom="suite" />
          </button>
        )}
      </div>

      <div className={v.panneau}>
        <div className={v.ligneHaut}>
          <span className={`${v.categorie} ${v[p.categorie]}`}>{libelleCategorie(p.categorie)}</span>
          {p.demo && <span className={v.demo}>Démonstration</span>}
        </div>
        <p className={v.auteur}>
          {p.auteur}
          {p.equipe ? <span> · {p.equipe}</span> : null}
        </p>
        <p className={v.fait}>
          <Picto nom="horloge" taille={17} />
          <span>
            Reçue le {momentParis(p.priseLe)} <em>(heure du serveur)</em>
          </span>
        </p>
        {ecart && p.priseAppareil && (
          <p className={`${v.fait} ${v.attention}`}>
            <Picto nom="alerte" taille={17} />
            <span>Heure de l&apos;appareil : {momentParis(p.priseAppareil)}</span>
          </p>
        )}
        <p className={v.fait}>
          <Picto nom="position" taille={17} />
          {p.latitude !== null && p.longitude !== null ? (
            <a href={urlCarte(p.latitude, p.longitude)} target="_blank" rel="noreferrer">
              Position jointe{p.precision ? ` (à ${Math.round(p.precision)} m près)` : ""} : voir sur la carte
            </a>
          ) : (
            <span>Sans position</span>
          )}
        </p>
        {p.note && <p className={v.note}>« {p.note} »</p>}
        <div className={v.actions}>
          <a className={v.bouton} href={urlPhoto(p.id, { telecharger: true })}>
            <Picto nom="telecharger" taille={19} />
            Télécharger
          </a>
          {actions?.(p)}
        </div>
      </div>
    </div>
  );
}
