"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icone } from "./Icone";

export type DossierAuChoix = {
  reference: string;
  trajet: string;
  periode: string;
  termine: boolean;
  photo: string;
};

/**
 * « Mes déménagements » : un client, un espace, tous ses dossiers dedans. En
 * haut à droite de chaque page d'un dossier, quand il en a plusieurs : la
 * liste de ses déménagements, le dossier ouvert marqué, pour passer de l'un
 * à l'autre en un geste ; et le choix complet (/espace-client?choisir=1).
 *
 * Un <details> : il s'ouvre sans JavaScript. Le script ne fait que le
 * refermer (clic ailleurs, Échap, un dossier choisi).
 */
export function ChoixDossier({ courant, dossiers }: { courant: string; dossiers: DossierAuChoix[] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fermer = () => ref.current?.removeAttribute("open");
    const clic = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) fermer();
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        fermer();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", clic);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("click", clic);
      document.removeEventListener("keydown", touche);
    };
  }, []);

  const fermer = () => ref.current?.removeAttribute("open");

  return (
    <details className="choix-dossier" ref={ref}>
      <summary className="chip-glass" aria-label={`Mes déménagements : ${dossiers.length} dossiers`}>
        <Icone nom="swap" />
        <span className="lbl">Mes déménagements</span>
        <span className="nb" aria-hidden>
          {dossiers.length}
        </span>
      </summary>
      <div className="choix-panneau">
        <p className="choix-titre">Mes déménagements</p>
        <ul>
          {dossiers.map((d) => {
            const ici = d.reference === courant;
            return (
              <li key={d.reference}>
                <Link href={`/espace-client/${encodeURIComponent(d.reference)}`} aria-current={ici ? "page" : undefined} onClick={fermer} className={ici ? "ici" : undefined}>
                  <i style={{ backgroundImage: `url('${d.photo}')` }} aria-hidden />
                  <span>
                    <b>{d.trajet}</b>
                    <small>
                      {d.termine ? "Terminé" : d.periode} · {d.reference}
                    </small>
                  </span>
                  {ici ? <em>Ouvert</em> : <Icone nom="arrow" />}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link className="choix-tous" href="/espace-client?choisir=1" onClick={fermer}>
          Voir tous mes déménagements <Icone nom="arrow" />
        </Link>
      </div>
    </details>
  );
}
