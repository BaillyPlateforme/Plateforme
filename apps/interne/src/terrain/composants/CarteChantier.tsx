import Link from "next/link";
import type { Chantier, Genre } from "../lib/planning";
import { Picto } from "./Picto";
import s from "./terrain.module.css";

export const GENRES: Record<Genre, string> = {
  chargement: "Chargement",
  livraison: "Livraison",
  chargement_livraison: "Chargement et livraison",
  groupage: "Groupage",
  manuelle: "Opération",
};

/** L'étage et l'accès d'une étape, en quelques mots. */
export function precisions(e: { etage: string | null; ascenseur: boolean | null; acces: string | null }) {
  return [e.etage ? (/^(rdc|rez)/i.test(e.etage) ? e.etage : `Étage : ${e.etage}`) : null, e.ascenseur ? "Ascenseur" : null, e.acces].filter(
    (x): x is string => !!x,
  );
}

/** Un chantier de la liste du jour : toute la carte est une cible, pour le pouce. */
export default function CarteChantier({ c, montrerEquipe }: { c: Chantier; montrerEquipe: boolean }) {
  const lieu = [c.adresse, ...precisions(c)].filter(Boolean).join(" · ");
  return (
    <Link href={`/terrain/dossier/${c.dossierId}`} className={`${s.carte} ${s[c.genre]}`}>
      <div className={s.carteCorps}>
        <div className={s.carteHaut}>
          <span className={s.genre}>{GENRES[c.genre]}</span>
        </div>
        <span className={s.client}>{c.client}</span>
        <span className={s.ref}>
          {c.ref}
          {c.trajet ? ` · ${c.trajet}` : ""}
        </span>
        {lieu && (
          <span className={s.ligne}>
            <Picto nom="position" taille={18} />
            <span>{lieu}</span>
          </span>
        )}
        {montrerEquipe && c.equipe && (
          <span className={s.ligne}>
            <Picto nom="equipe" taille={18} />
            <span>{c.equipe}</span>
          </span>
        )}
        {c.immatriculation && (
          <span className={s.ligne}>
            <Picto nom="camion" taille={18} />
            <span className={s.plaque}>
              <span>{c.immatriculation}</span>
            </span>
          </span>
        )}
      </div>
      <div className={s.carteFin}>
        {c.photos > 0 ? (
          <span className={s.comptePhotos}>
            <Picto nom="appareil" taille={15} epaisseur={2.4} />
            {c.photos}
          </span>
        ) : (
          <span />
        )}
        <span className={s.fleche} aria-hidden>
          <Picto nom="suite" />
        </span>
      </div>
    </Link>
  );
}
