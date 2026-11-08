"use client";

import { useId, useState } from "react";
import { CATEGORIES, type Categorie } from "./categories";
import s from "./partenaires.module.css";

/*
 * Le champ « prestataire » d'une lettre de voiture : on choisit une société
 * de l'annuaire (la liste s'ouvre en tapant), ou l'on garde un texte libre,
 * comme avant. Une pastille dit lequel des deux : le lien à l'annuaire se
 * pose à l'enregistrement quand le nom est celui d'une fiche.
 */
export default function SaisiePrestataire({
  nom = "prestataire",
  valeur,
  annuaire,
  id,
}: {
  nom?: string;
  valeur: string | null;
  annuaire: { id: number; nom: string; categorie: Categorie; ville: string | null }[];
  id?: string;
}) {
  const liste = useId();
  const [texte, setTexte] = useState(valeur ?? "");
  const trouve = annuaire.find((a) => a.nom.trim().toLowerCase() === texte.trim().toLowerCase());
  return (
    <span className={s.saisie}>
      <input id={id} type="text" name={nom} value={texte} onChange={(e) => setTexte(e.target.value)} list={liste} autoComplete="off" placeholder="Société de l'annuaire, ou texte libre" />
      <datalist id={liste}>
        {annuaire.map((a) => (
          <option key={a.id} value={a.nom}>
            {[CATEGORIES[a.categorie]?.libelle, a.ville].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {/* Une société de l'annuaire : la pastille ouvre sa fiche (Partenaires), dans un nouvel onglet pour ne pas perdre la saisie. */}
      {texte.trim() &&
        (trouve ? (
          <a className={s.lienAnnuaire} data-lie="oui" href={`/partenaires/${trouve.id}`} target="_blank" rel="noopener" title="Société de l'annuaire : ouvrir sa fiche">
            Annuaire
          </a>
        ) : (
          <em className={s.lienAnnuaire} data-lie="non" title="Texte libre : ce nom n'est pas dans l'annuaire">
            Libre
          </em>
        ))}
    </span>
  );
}
