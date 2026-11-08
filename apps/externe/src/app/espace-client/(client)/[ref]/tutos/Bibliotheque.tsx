"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Icone } from "../../../_ui/Icone";
import { Insecable } from "./Insecable";

/** Une carte de la bibliothèque : ce que le navigateur reçoit d'un tutoriel. */
export type CarteTuto = {
  id: string;
  slug: string;
  numero: number;
  titre: string;
  resume: string;
  categorie: string;
  vignette: string;
  video: boolean;
  /** « 1:27 », quand on connaît la vidéo. */
  dureeVideo: string | null;
  dureeMin: number;
  etapes: number;
  niveau: string | null;
  vu: boolean;
};

const d = (n: number) => ({ "--d": n }) as CSSProperties;
const nn = (n: number) => String(n).padStart(2, "0");

/**
 * La bibliothèque des tutoriels : les catégories en filtres (« Tous »,
 * Emballage, Organisation, Démarches), puis les cartes — l'affiche de la
 * vidéo, sa durée, la catégorie, le nombre d'étapes, et « Vu » quand le
 * client l'a vu.
 */
export function Bibliotheque({ cartes, categories, base, recommande }: { cartes: CarteTuto[]; categories: string[]; base: string; recommande: string | null }) {
  const [filtre, setFiltre] = useState<string | null>(null);
  const visibles = filtre ? cartes.filter((c) => c.categorie === filtre) : cartes;
  const filtres: [string | null, string, number][] = [[null, "Tous", cartes.length], ...categories.map((c) => [c, c, cartes.filter((x) => x.categorie === c).length] as [string, string, number])];

  return (
    <>
      {categories.length > 1 && (
        <div className="tx-filtres apparait" role="group" aria-label="Filtrer par catégorie">
          {filtres.map(([cle, label, n]) => (
            <button key={label} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
              {label}
              <span>{n}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="tx-grille" aria-live="polite">
        {visibles.map((c, i) => (
          <li key={c.id} className="apparait" style={d(i)}>
            <Link className={`tx-carte${c.vu ? " est-vu" : ""}${c.slug === recommande ? " est-reco" : ""}`} href={`${base}/${c.slug}`}>
              <span className="tx-affiche">
                <Image src={c.vignette} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1080px) 50vw, 380px" />
                {c.video && (
                  <span className="tx-duree-video" aria-label={c.dureeVideo ? `Vidéo, ${c.dureeVideo}` : "Vidéo"}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                    {c.dureeVideo ?? "Vidéo"}
                  </span>
                )}
                {c.vu && (
                  <span className="tx-pastille-vu">
                    <Icone nom="check" /> Vu
                  </span>
                )}
                {c.slug === recommande && !c.vu && <span className="tx-pastille-reco">Recommandé</span>}
              </span>
              <span className="tx-carte-corps">
                <span className="tx-carte-k">
                  <b>Tuto {nn(c.numero)}</b>
                  {c.categorie && <span>{c.categorie}</span>}
                </span>
                <strong>
                  <Insecable texte={c.titre} />
                </strong>
                <span className="tx-carte-resume">{c.resume}</span>
                <span className="tx-carte-meta">
                  <span>
                    <Icone nom="clock" /> {c.dureeMin} min
                  </span>
                  <span>{c.etapes} étapes</span>
                  {c.niveau && <span>{c.niveau}</span>}
                  <span className="go" aria-hidden>
                    <Icone nom="arrow" />
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
